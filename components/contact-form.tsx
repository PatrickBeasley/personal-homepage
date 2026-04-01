"use client";

import { FormEvent, useState } from "react";

type FormStatus = "idle" | "submitting" | "success" | "error";

export default function ContactForm() {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function submitContactForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload = {
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      subject: String(formData.get("subject") ?? "").trim(),
      message: String(formData.get("message") ?? "").trim(),
    };

    if (!payload.name || !payload.email || !payload.message) {
      setStatus("error");
      setErrorMessage("Please complete name, email, and message.");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(data.error || "Could not send your message. Please try again.");
        return;
      }

      form.reset();
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={submitContactForm} className="space-y-4 max-w-2xl">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-zinc-700 dark:text-zinc-300 flex flex-col gap-2">
          Name
          <input
            name="name"
            type="text"
            required
            maxLength={120}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-black dark:text-white"
          />
        </label>

        <label className="text-sm text-zinc-700 dark:text-zinc-300 flex flex-col gap-2">
          Email
          <input
            name="email"
            type="email"
            required
            maxLength={255}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-black dark:text-white"
          />
        </label>
      </div>

      <label className="text-sm text-zinc-700 dark:text-zinc-300 flex flex-col gap-2">
        Subject (optional)
        <input
          name="subject"
          type="text"
          maxLength={200}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-black dark:text-white"
        />
      </label>

      <label className="text-sm text-zinc-700 dark:text-zinc-300 flex flex-col gap-2">
        Message
        <textarea
          name="message"
          required
          rows={6}
          maxLength={5000}
          className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-black dark:text-white"
        />
      </label>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex items-center rounded-lg bg-black dark:bg-white text-white dark:text-black px-6 py-3 font-medium hover:opacity-90 disabled:opacity-60"
      >
        {status === "submitting" ? "Sending..." : "Send message"}
      </button>

      {status === "success" && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Thanks. Your message was sent successfully.
        </p>
      )}

      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </form>
  );
}
