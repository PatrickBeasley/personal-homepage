"use client";

import { useState, useEffect } from "react";

interface FileMetadata {
  id: string;
  file_name: string;
  file_size_bytes: number;
  visibility: "private" | "public";
  created_at: string;
  description: string | null;
}

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: "unread" | "in_progress" | "resolved" | "archived";
  created_at: string;
}

type Tab = "files" | "contacts";

export default function AdminDashboardClient({ userEmail: _userEmail }: { userEmail: string | undefined }) {
  const [activeTab, setActiveTab] = useState<Tab>("files");
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [contacts, setContacts] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  // Load files and contacts on mount
  useEffect(() => {
    loadFiles();
    loadContacts();
  }, []);

  async function loadFiles() {
    try {
      setLoading(true);
      const response = await fetch("/api/files");
      const data = await response.json();
      if (response.ok) {
        setFiles(data.files);
      }
    } catch (err) {
      console.error("Failed to load files:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadContacts() {
    try {
      const response = await fetch("/api/contact-submissions");
      const data = await response.json();
      if (response.ok) {
        setContacts(data.submissions);
      }
    } catch (err) {
      console.error("Failed to load contacts:", err);
    }
  }

  async function handleFileUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError("");
    setUploadSuccess("");

    const formData = new FormData(e.currentTarget);
    const file = formData.get("file") as File;
    const description = formData.get("description") as string;

    if (!file) {
      setUploadError("Please select a file");
      return;
    }

    try {
      setLoading(true);
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      if (description) {
        uploadFormData.append("description", description);
      }

      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: uploadFormData,
      });

      const data = await response.json();

      if (response.ok) {
        setUploadSuccess("File uploaded successfully");
        e.currentTarget.reset();
        await loadFiles();
      } else {
        setUploadError(data.error || "Upload failed");
      }
    } catch (err) {
      setUploadError("Upload failed: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  async function deleteFile(id: string) {
    if (!confirm("Are you sure you want to delete this file?")) {
      return;
    }

    try {
      const response = await fetch(`/api/files/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadFiles();
      } else {
        alert("Failed to delete file");
      }
    } catch (err) {
      alert("Delete failed: " + String(err));
    }
  }

  async function toggleFileVisibility(file: FileMetadata) {
    const newVisibility = file.visibility === "private" ? "public" : "private";

    try {
      const response = await fetch(`/api/files/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: newVisibility }),
      });

      if (response.ok) {
        await loadFiles();
      } else {
        alert("Failed to update file visibility");
      }
    } catch (err) {
      alert("Update failed: " + String(err));
    }
  }

  async function updateContactStatus(
    id: string,
    status: ContactSubmission["status"]
  ) {
    try {
      const response = await fetch(`/api/contact-submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (response.ok) {
        await loadContacts();
      } else {
        alert("Failed to update submission status");
      }
    } catch (err) {
      alert("Update failed: " + String(err));
    }
  }

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("files")}
          className={`px-4 py-2 font-medium border-b-2 ${
            activeTab === "files"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Files
        </button>
        <button
          onClick={() => setActiveTab("contacts")}
          className={`px-4 py-2 font-medium border-b-2 ${
            activeTab === "contacts"
              ? "border-blue-500 text-blue-600"
              : "border-transparent text-gray-600 hover:text-gray-900"
          }`}
        >
          Contact Submissions
        </button>
      </div>

      {/* Files Tab */}
      {activeTab === "files" && (
        <div className="space-y-8">
          {/* Upload Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Upload File</h2>

            <form onSubmit={handleFileUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  File
                </label>
                <input
                  type="file"
                  name="file"
                  required
                  accept=".pdf,.docx,.txt,.md,.sql,.py"
                  className="block w-full border border-gray-300 rounded-lg p-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Allowed: PDF, DOCX, TXT, MD, SQL, PY (Max 10MB)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (optional)
                </label>
                <input
                  type="text"
                  name="description"
                  placeholder="Brief description of the file"
                  className="block w-full border border-gray-300 rounded-lg p-2"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Uploading..." : "Upload"}
              </button>

              {uploadError && (
                <p className="text-red-600 text-sm">{uploadError}</p>
              )}
              {uploadSuccess && (
                <p className="text-green-600 text-sm">{uploadSuccess}</p>
              )}
            </form>
          </div>

          {/* Files List */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Files</h2>

            {files.length === 0 ? (
              <p className="text-gray-500">No files uploaded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="text-left py-2 font-semibold">File Name</th>
                      <th className="text-left py-2 font-semibold">Size</th>
                      <th className="text-left py-2 font-semibold">Visibility</th>
                      <th className="text-left py-2 font-semibold">Uploaded</th>
                      <th className="text-left py-2 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3">{file.file_name}</td>
                        <td className="py-3">
                          {(file.file_size_bytes / 1024).toFixed(1)} KB
                        </td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              file.visibility === "public"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {file.visibility}
                          </span>
                        </td>
                        <td className="py-3 text-gray-500">
                          {new Date(file.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 space-x-2">
                          <button
                            onClick={() => toggleFileVisibility(file)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            {file.visibility === "private" ? "Make Public" : "Make Private"}
                          </button>
                          <button
                            onClick={() => deleteFile(file.id)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contacts Tab */}
      {activeTab === "contacts" && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Submissions</h2>

          {contacts.length === 0 ? (
            <p className="text-gray-500">No contact submissions yet</p>
          ) : (
            <div className="space-y-4">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{contact.name}</h3>
                      <p className="text-sm text-gray-500">{contact.email}</p>
                      {contact.subject && (
                        <p className="text-sm font-medium text-gray-700 mt-1">
                          {contact.subject}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 mt-2">{contact.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(contact.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 min-w-fit">
                      <select
                        value={contact.status}
                        onChange={(e) =>
                          updateContactStatus(
                            contact.id,
                            e.target.value as ContactSubmission["status"]
                          )
                        }
                        className="text-xs border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="unread">Unread</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
