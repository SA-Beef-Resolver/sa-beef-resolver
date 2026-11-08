import json
from pathlib import Path
import uuid
import threading
import unittest
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from core import InvalidMessage, OllamaModel, RESULT_FIELDS, RetryableError, Store, language_for_history, validate
from pymongo.collection import Collection


class FakeModel:
    def __init__(self):
        self.calls = []

    def resolve(self, session, history):
        self.calls.append((session, json.loads(json.dumps(history))))
        return {key: "test resolution " + session for key in RESULT_FIELDS}


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.path = "ai_test_" + uuid.uuid4().hex
        self.store = Store(self.path)
        self.model = FakeModel()

    def tearDown(self):
        self.store.client.drop_database(self.path)
        self.store.close()

    def submit(self, session, people, message, job):
        return self.store.process(dict(sessionId=session, people=people, message=message), job, self.model)

    def test_interleaved_sessions_do_not_mix_and_wait_for_both_people(self):
        first = self.submit("A", 1, "ONLY_A_1", "a1")
        self.submit("B", 2, "ONLY_B_2", "b2")
        self.assertEqual(first["status"], "waiting_for_other_person")
        self.assertEqual(self.model.calls, [])
        self.submit("A", 2, "ONLY_A_2", "a2")
        self.submit("B", 1, "ONLY_B_1", "b1")
        self.assertEqual([x["message"] for x in self.model.calls[0][1]], ["ONLY_A_1", "ONLY_A_2"])
        self.assertEqual([x["message"] for x in self.model.calls[1][1]], ["ONLY_B_2", "ONLY_B_1"])

    def test_redelivery_after_restart_does_not_call_model_or_append_again(self):
        self.submit("A", 1, "one", "a1")
        original = self.submit("A", 2, "two", "a2")
        self.store.close()
        self.store = Store(self.path)
        self.assertEqual(self.submit("A", 2, "two", "a2"), original)
        self.assertEqual(len(self.model.calls), 1)
        self.assertEqual(self.store.get_session("A")["messageCount"], 2)

    def test_same_text_with_new_id_is_a_new_message(self):
        self.submit("A", 1, "one", "a1")
        result = self.submit("A", 1, "one", "a2")
        self.assertEqual(result["messageCount"], 2)

    def test_job_id_reuse_with_different_payload_is_rejected(self):
        self.submit("A", 1, "one", "a1")
        with self.assertRaises(InvalidMessage):
            self.submit("B", 1, "other", "a1")
        self.assertIsNone(self.store.get_session("B"))

    def test_failed_model_does_not_commit_second_argument_and_retry_can_recover(self):
        self.submit("A", 1, "one", "a1")
        with patch.object(self.model, "resolve", side_effect=RetryableError("offline")):
            with self.assertRaises(RetryableError):
                self.submit("A", 2, "two", "a2")
        self.assertEqual(self.store.get_session("A")["version"], 1)
        self.assertEqual(self.submit("A", 2, "two", "a2")["version"], 2)

    def test_new_argument_reanalyzes_only_its_session(self):
        self.submit("A", 1, "one", "a1")
        self.submit("A", 2, "two", "a2")
        self.submit("B", 1, "private B", "b1")
        result = self.submit("A", 1, "additional", "a3")
        self.assertEqual(result["version"], 3)
        self.assertEqual(len(self.model.calls[-1][1]), 3)
        self.assertNotIn("private B", json.dumps(self.model.calls[-1]))

    def test_every_resolution_is_retained_and_duplicate_does_not_add_a_round(self):
        self.submit("A", 1, "one", "a1")
        self.submit("A", 2, "two", "a2")
        self.submit("A", 1, "additional", "a3")
        self.submit("A", 1, "additional", "a3")
        rounds = self.store.get_resolutions("A")
        self.assertEqual([r["version"] for r in rounds], [2, 3])
        self.assertEqual([len(r["arguments"]) for r in rounds], [2, 3])
        self.assertEqual(self.store.db.jobs.count_documents({}), 3)

    def test_transaction_rolls_back_all_collections_if_result_insert_fails(self):
        self.submit("A", 1, "one", "a1")
        original = Collection.insert_one
        def fail_result(collection, *args, **kwargs):
            if collection.name == "resolutions":
                raise RuntimeError("simulated database failure")
            return original(collection, *args, **kwargs)
        with patch.object(Collection, "insert_one", fail_result), self.assertRaises(RuntimeError):
            self.submit("A", 2, "two", "a2")
        self.assertEqual(self.store.get_session("A")["version"], 1)
        self.assertIsNone(self.store.db.jobs.find_one({"_id": "a2"}))
        self.assertEqual(self.store.get_resolutions("A"), [])

    def test_optimistic_concurrency_prevents_lost_history(self):
        self.submit("A", 1, "one", "a1")
        class RacingModel:
            def resolve(inner, session, history):
                self.submit("A", 1, "arrived concurrently", "a-new")
                return {key: "test" for key in RESULT_FIELDS}
        with self.assertRaises(RetryableError):
            self.store.process(dict(sessionId="A", people=2, message="two"), "a2", RacingModel())
        self.assertEqual(self.store.get_session("A")["messageCount"], 2)
        self.assertEqual(self.submit("A", 2, "two", "a2")["messageCount"], 3)

    def test_validation_and_numeric_session_normalization(self):
        self.assertEqual(validate(dict(sessionId=101, people=1, message=" a "))["sessionId"], "101")
        for data in [dict(sessionId=True, people=1, message="a"),
                     dict(sessionId="A", people=True, message="a"),
                     dict(sessionId="A", people=3, message="a"),
                     dict(sessionId="A", people=1, message=" "), {}]:
            with self.subTest(data=data), self.assertRaises(InvalidMessage):
                validate(data)

    def test_history_limit_is_explicit_and_does_not_silently_truncate(self):
        self.submit("A", 1, "x" * 8000, "a1")
        with self.assertRaises(InvalidMessage):
            self.submit("A", 2, "y" * 5000, "a2")
        self.assertEqual(self.store.get_session("A")["messageCount"], 1)


class LanguageTests(unittest.TestCase):
    @staticmethod
    def argument(side, statement, argument_id, version=1):
        return {"people": side, "message": json.dumps({
            "argumentId": argument_id, "version": version, "statement": statement,
            "evidence": [{"type": "LINK", "url": "https://example.com/english-evidence", "description": "photo"}]
        }, ensure_ascii=False)}

    def test_thai_statements_ignore_english_json_metadata_and_urls(self):
        history = [self.argument(1, "ฉันยืมหนังสือแล้วคืนให้เขา", "a"),
                   self.argument(2, "ฉันยังไม่ได้รับหนังสือคืน", "b")]
        self.assertEqual(language_for_history(history), "Thai")

    def test_one_english_argument_selects_english(self):
        history = [self.argument(1, "ฉันยืมหนังสือแล้วคืนให้เขา", "a"),
                   self.argument(2, "I did not receive the book back.", "b")]
        self.assertEqual(language_for_history(history), "English")

    def test_latest_revision_controls_language(self):
        history = [self.argument(1, "I returned the book.", "a", 1),
                   self.argument(1, "ฉันคืนหนังสือแล้ว", "a", 2),
                   self.argument(2, "ฉันยังไม่ได้รับหนังสือคืน", "b")]
        self.assertEqual(language_for_history(history), "Thai")

    def test_plain_text_english_arguments(self):
        self.assertEqual(language_for_history([{"people": 1, "message": "I returned it."}]), "English")


class OllamaHttpTests(unittest.TestCase):
    def test_actual_http_adapter_sends_fresh_session_context_and_validates_response(self):
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                requests.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(200)
                self.end_headers()
                output = {key: "ทดสอบ" for key in RESULT_FIELDS}
                self.wfile.write(json.dumps({"message": {"content": json.dumps(output)}}).encode())

            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            model = OllamaModel()
            model.url = "http://127.0.0.1:" + str(server.server_port)
            model.resolve("A", [{"people": 1, "message": "SECRET_A"}])
            model.resolve("B", [LanguageTests.argument(2, "I have the book.", "b", 1),
                                LanguageTests.argument(2, "ฉันยังไม่ได้รับหนังสือคืน", "b", 2)])
            self.assertNotIn("SECRET_A", json.dumps(requests[1]))
            self.assertFalse(requests[0]["stream"])
            self.assertFalse(requests[0]["think"])
            self.assertEqual(set(requests[0]["format"]["required"]), RESULT_FIELDS)
            self.assertTrue(all(field["type"] == "string" for field in requests[0]["format"]["properties"].values()))
            self.assertEqual(len(requests[1]["messages"]), 2)
            current = json.loads(requests[1]["messages"][1]["content"])["arguments"]
            self.assertEqual(len(current), 1)
            self.assertEqual(json.loads(current[0]["message"])["version"], 2)
            self.assertIn("Write all five JSON string values in English", requests[0]["messages"][0]["content"])
            self.assertIn("Write all five JSON string values in natural Thai", requests[1]["messages"][0]["content"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
