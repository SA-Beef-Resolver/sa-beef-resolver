# Handoff: recording the video (Service Discovery and Non-functional Requirements)

The clip must be under 5 minutes and explain how the project manages **service discovery** and the **non-functional requirements**. This file has everything needed to record it.

## Files

| File | What it is |
| --- | --- |
| `docs/video-script-service-discovery-nfr.md` | The timed script with every command to run on screen (English notes) |
| This file | Setup, the Thai narration, the checklist and the known problems |
| `docs/Human Resolve - Updated v4.docx` | The proposal document (ADRs, microservice design, diagrams). Figure 1 (architecture) and the NFR table at the end are shown in the clip |
| `docs/kong-demo.md`, `kong/kong.yml` | Kong notes and routes (on the `kong-gateway` branch) |

## Setup (about 15 minutes the first time)

1. Use the **`kong-gateway`** branch. It has Kong and the web app; `dev` and `main` do not.
   ```bash
   git switch kong-gateway
   ```
2. Docker Desktop must be running and healthy (`docker ps` must answer).
3. If another container already uses port 5432 or 27017, copy `.env.example` to `.env` and add `POSTGRES_HOST_PORT=5433` and `MONGO_HOST_PORT=27018`.
4. Start everything. The first start downloads images and the Ollama model (several GB), so do this well before recording.
   ```bash
   docker compose up -d --build
   docker compose ps          # kong must show "healthy"
   ```
5. Install `grpcurl` if you want the gRPC step (or skip that one command).

Addresses: web app http://127.0.0.1:8081, RabbitMQ http://127.0.0.1:8080 (user `ai`, password `ai-local-only`), Kong Manager http://127.0.0.1:8002, Kong REST http://127.0.0.1:8000, Kong gRPC 127.0.0.1:9080. If Kong is published on the Wi-Fi address, use that address as in `docs/kong-demo.md`.

## Before pressing record

- In the web app register two users (Maya and Nina), create one dispute between them and write one argument as Maya. Register a third user (Carl) who is not in the dispute.
- Open three browser tabs: the web app, the RabbitMQ Queues page, Kong Manager.
- Keep two terminals open: one for the demo commands, one for the stop and start commands.
- Do one full run without recording to check the timing.

## Narration (Thai), with the time of each part

Run the commands for each part from `docs/video-script-service-discovery-nfr.md`.

**0:00 to 0:20 Introduction** (show Figure 1, the architecture diagram)
"สวัสดีครับ โปรเจกต์ชื่อ Me don't wrong ระบบมีสามบริการหลัก คือ Dispute Service เขียนด้วย Node.js, Evidence Service เขียนด้วย .NET และ AI Service เขียนด้วย Python สื่อสารกันผ่าน REST, gRPC และ RabbitMQ ในคลิปนี้จะแสดงว่าบริการหาเจอกันได้อย่างไร และระบบจัดการ Non-functional Requirement อย่างไร"

**0:20 to 1:55 Service discovery**

A. Find each other by name (`docker compose ps`, the DNS lookup, `docker compose config | grep ...`):
"ทุกบริการมีชื่อบนเครือข่ายของ Docker Compose ตัว DNS ของ Docker จะแปลงชื่อเป็นที่อยู่ของ container ให้ ในโค้ดเรียกกันด้วยชื่อ เช่น evidence-service พอร์ต 50051 และ beef-crud-service พอร์ต 3000 โดยตั้งผ่าน environment variable จึงไม่มี IP เขียนอยู่ในโค้ดเลย"

B. Kong is the single entry point (show `kong/kong.yml`, Kong Manager Services and Routes, then curl and grpcurl):
"Kong ตั้งค่าไว้ในไฟล์เดียว ส่ง /api/beefs ไปที่ Dispute Service ส่ง gRPC สองบริการไปที่ Evidence Service และส่ง /ai ไปที่ AI Result API ลูกค้ารู้แค่ที่อยู่ของ Kong ที่เห็นว่าได้ 401 พร้อมหัว Via: kong แสดงว่าคำขอผ่าน Kong ไปถึงบริการแล้ว แต่ถูกปฏิเสธเพราะไม่มีโทเค็น"

C. A restarted service is still found (inspect the IP, recreate `beef-crud-service`, inspect again, curl through Kong):
"ผมสร้าง Dispute Service ใหม่ ที่อยู่ของมันอาจเปลี่ยน แต่ชื่อยังเหมือนเดิม จึงเรียกผ่าน Kong ได้ตามปกติ"

Limits:
"การค้นหาบริการแบบนี้เป็นแบบ static ครับ บริการไม่ได้ลงทะเบียนตัวเอง แต่ละบริการมีตัวเดียว และ route ของ Kong แก้ด้วยมือ ถ้าต้องการหลาย instance ควรใช้ registry เช่น Consul หรือ Kubernetes"

**1:55 to 2:50 Availability** (stop `ai-worker-0` and `ai-worker-1`, press Send to AI in the web app, show the waiting message in RabbitMQ, start the workers)
"ผมปิด AI worker ทั้งสองตัวแล้วส่ง argument ให้ AI ข้อความไม่หายครับ ค้างรออยู่ในคิว RabbitMQ เพราะคิวเป็นแบบ durable และ broker ยืนยันทุกข้อความ พอเปิด worker กลับมา ข้อความก็ถูกดึงไปประมวลผลจนคิวว่าง นอกจากนี้ container รีสตาร์ตเองอัตโนมัติ และมี health check เพื่อให้ฐานข้อมูลกับ broker พร้อมก่อนบริการเริ่มทำงาน"

**2:50 to 3:25 Reliability** (stop `beef-crud-service`, try to save an argument, start it again)
"Evidence Service ต้องถาม Dispute Service ก่อนบันทึกทุกครั้ง ถ้า Dispute Service ล่ม จะตอบ UNAVAILABLE ไม่ยอมบันทึกข้อมูลที่ตรวจสอบไม่ได้ พอเปิดกลับมาก็บันทึกได้ และข้อความที่ส่งให้ AI มี id ของ argument กับเวอร์ชัน ส่งซ้ำก็ไม่ได้คำตอบ AI ซ้ำ"

**3:25 to 3:50 Security** (the 401 from Kong again, then open the dispute as Carl)
"ทุกคำขอต้องมี JWT และแต่ละบริการตรวจเอง เฉพาะสองคนในข้อพิพาทเท่านั้นที่เห็นและแก้ได้ บัญชีที่สามเปิดแล้วเจอข้อความว่าไม่ใช่คู่กรณี รหัสผ่านเก็บเป็นค่า hash ที่มี salt สิ่งที่ยังไม่มีคือ TLS และการเข้ารหัสข้อมูลที่เก็บ"

**3:50 to 4:25 Scalability and performance** (`docker compose ps ai-worker-0 ai-worker-1`, show queues `work.0` and `work.1`)
"งาน AI ถูกแบ่งเข้าคิวตาม dispute id สองฝั่งของข้อพิพาทเดียวกันไปถึง worker ตัวเดียวกันตามลำดับ ถ้ามีข้อพิพาทมากขึ้นก็เพิ่มคิวและ worker ได้ แต่ยังไม่ได้ทดสอบโหลดเป้า 500 ข้อพิพาท ด้านความเร็ว คำขอตอบกลับทันทีเพราะ AI ทำงานผ่านคิว แต่ผลของ AI เองใช้เวลานานกว่า 5 วินาทีเมื่อใช้โมเดล local ขนาดเล็ก จึงยังไม่ผ่านเป้านี้ ถ้าใช้โมเดลแบบ hosted หรือมี GPU ก็แก้ได้"

**4:25 to 4:50 Wrap-up** (show the NFR table at the end of the proposal)
"สรุปครับ บริการหากันด้วยชื่อผ่าน Docker DNS และ Kong เป็นทางเข้าเดียว ส่วน availability กับ reliability มาจาก RabbitMQ, health check และการรีสตาร์ตอัตโนมัติ ส่วน security มาจาก JWT สิ่งที่ยังขาดคือ TLS การทดสอบโหลด และเป้า AI 5 วินาที ขอบคุณครับ"

If the clip runs long, drop part C of service discovery (about 25 seconds).

## Known problems and what has not been checked

- **The commands in the script have not been run on the full stack.** They were written from `docker-compose.yml`, `kong/kong.yml` and `docs/kong-demo.md`. The author's Docker Desktop failed to start ("Docker Desktop is unable to start"), so the test could not be done. Rehearse once and fix any command that does not work (container names, ports, the Kong address).
- The AI result may take more than a minute on a CPU, or not appear during the clip. That is fine, because the demos only need the queue, the failure handling and the security checks.
- In the NFR table of the proposal, the 5 second AI target and TLS are marked as **not met**. Say so in the clip; the narration above does.
- The proposal's member list still has a stray `]` in the first student id (`6631309921]`). Fix it in the final document if it should not be there.
