import { useState } from "react";
import { Upload, Loader2, AlertCircle, CheckCircle2, FileWarning } from "lucide-react";

// Quick test harness for the /upload grouping endpoint.
// Assumes: endpoint is POST http://localhost:8000/upload
// Assumes: form field name is "files" (matches `files: list[UploadFile] = File(...)` in FastAPI)
// Adjust ENDPOINT_URL and the field name below if your route differs.

const ENDPOINT_URL = "http://localhost:8001/upload";

export default function UploadTester() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  function handleFileChange(e) {
    setSelectedFiles(Array.from(e.target.files));
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
  }

  async function handleUpload() {
    if (selectedFiles.length === 0) return;

    setStatus("loading");
    setErrorMsg("");

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append("files", file); // must match FastAPI param name
    });

    try {
      const res = await fetch(ENDPOINT_URL, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server responded ${res.status}: ${text}`);
      }

      const data = await res.json();
      setResult(data);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err.message || "Request failed");
      setStatus("error");
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Upload Grouping Test</h2>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
        Posts selected files to <code>{ENDPOINT_URL}</code> and shows the raw grouping response.
      </p>

      <div
        style={{
          border: "1px dashed #bbb",
          borderRadius: 8,
          padding: 24,
          textAlign: "center",
          marginBottom: 16,
        }}
      >
        <input
          type="file"
          multiple
          onChange={handleFileChange}
          style={{ display: "block", margin: "0 auto 12px" }}
        />
        {selectedFiles.length > 0 && (
          <p style={{ fontSize: 13, color: "#444" }}>
            {selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""} selected:{" "}
            {selectedFiles.map((f) => f.name).join(", ")}
          </p>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={selectedFiles.length === 0 || status === "loading"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: 6,
          border: "none",
          background: selectedFiles.length === 0 ? "#ccc" : "#2563eb",
          color: "white",
          fontWeight: 500,
          cursor: selectedFiles.length === 0 ? "not-allowed" : "pointer",
        }}
      >
        {status === "loading" ? (
          <>
            <Loader2 size={16} className="spin" /> Uploading...
          </>
        ) : (
          <>
            <Upload size={16} /> Upload & Group
          </>
        )}
      </button>

      {status === "error" && (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            borderRadius: 6,
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            color: "#991b1b",
            fontSize: 13,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Request failed.</strong>
            <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{errorMsg}</div>
          </div>
        </div>
      )}

      {status === "success" && result && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#166534",
              marginBottom: 12,
            }}
          >
            <CheckCircle2 size={16} />
            Got a response — {result.total_files} file(s) processed.
          </div>

          {result.groups && result.groups.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Groups ({result.groups.length})
              </h3>
              {result.groups.map((group, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    padding: 12,
                    marginBottom: 8,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>
                    Headers: {group.display_headers?.join(", ")}
                  </div>
                  <div style={{ color: "#666", marginTop: 4 }}>
                    Files ({group.files?.length}): {group.files?.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.no_header_files && result.no_header_files.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                fontSize: 13,
                color: "#92400e",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 6,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <FileWarning size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>No header detected:</strong> {result.no_header_files.join(", ")}
              </div>
            </div>
          )}

          <details>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "#666" }}>
              Raw JSON response
            </summary>
            <pre
              style={{
                background: "#f8f8f8",
                padding: 12,
                borderRadius: 6,
                fontSize: 11,
                overflowX: "auto",
                marginTop: 8,
              }}
            >
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}