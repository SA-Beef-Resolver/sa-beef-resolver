@echo off
rem Copies the live SQLite file out of the container so DataGrip can open it. Re-run after every change.
cd /d "%~dp0.."
if not exist db-snapshot mkdir db-snapshot
docker compose cp beef-crud-service:/data/beef-resolver.db db-snapshot/beef-resolver.db
echo Saved %CD%\db-snapshot\beef-resolver.db
