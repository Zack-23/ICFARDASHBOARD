
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import json, os, uuid
import pandas as pd
from fastapi.middleware.cors import CORSMiddleware
from backend.validator import extract_header, group_uploaded_files
from typing import List, Annotated
from pydantic import WithJsonSchema

app = FastAPI()
SwaggerUploadFile = Annotated[UploadFile, WithJsonSchema({"type": "string", "format": "binary"})]
# allows react app to make requests to FASTAPI backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174"],  # allows react to make requests to backend
    allow_methods=["*"], # allows requests from vite react frontend
    allow_headers=["*"], # allows all request headers
)

# making a folder to store the files uploaded by user
SESSIONS_DIR = "../sessions"
os.makedirs(SESSIONS_DIR, exist_ok=True)

@app.post("/postings/inspect")
# uploading file on fastapi to test
async def upload_inspect(file: UploadFile = File(...)):
    contents = await file.read()
    text = contents.decode("utf-8", errors="ignore")
    extracted_header = extract_header(text)

    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": len(contents),
        "header": extracted_header
    }
@app.post("/upload")
async def upload(files: list[UploadFile] = File(...)):
    result = await group_uploaded_files(files)
    return result


@app.get("/")
def root():
    return {"message": "API is running"}

