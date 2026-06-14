#!/usr/bin/env python3
import html
import json
import os
import re
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
SETTINGS_PATH = ROOT / "local-print-settings.json"
HOST = "127.0.0.1"
PORT = 8765

DEFAULT_SETTINGS = {
    "printer": "",
    "preset": "",
    "media": "Custom.100x48mm",
    "fitToPage": True,
    "orientation": "portrait",
    "rawOptions": ""
}


def load_settings():
    if not SETTINGS_PATH.exists():
        return DEFAULT_SETTINGS.copy()
    try:
        settings = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return DEFAULT_SETTINGS.copy()
    merged = DEFAULT_SETTINGS.copy()
    merged.update({key: value for key, value in settings.items() if key in merged})
    return merged


def save_settings(settings):
    merged = DEFAULT_SETTINGS.copy()
    merged.update({key: value for key, value in settings.items() if key in merged})
    SETTINGS_PATH.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    return merged


def run_command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=False)
    except OSError as error:
        return {"ok": False, "stdout": "", "stderr": str(error), "code": 1}
    return {
        "ok": result.returncode == 0,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "code": result.returncode
    }


def list_printers():
    result = run_command(["lpstat", "-p", "-d"])
    printers = []
    default_printer = ""
    for line in (result["stdout"] + "\n" + result["stderr"]).splitlines():
        printer_match = re.match(r"printer\s+(\S+)\s+", line)
        if printer_match:
            printers.append(printer_match.group(1))
        default_match = re.search(r"system default destination:\s*(\S+)", line)
        if default_match:
            default_printer = default_match.group(1)
    return {
        "printers": printers,
        "defaultPrinter": default_printer,
        "error": "" if result["ok"] or printers else result["stderr"].strip()
    }


def pdf_text(value):
    return str(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def wrap_text(value, max_chars=24, max_lines=2):
    words = str(value).split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines[:max_lines] or [""]


def pdf_stream_for_label(label):
    product_lines = wrap_text(label.get("product", ""), 26, 2)
    weight = label.get("weight", "--")
    qty = label.get("qty", "--")
    packed_on = label.get("packedOn", "")
    commands = [
        "0 0 0 rg",
        "1 w",
        "BT /F1 21 Tf 12 116 Td"
    ]
    for index, line in enumerate(product_lines):
        if index:
            commands.append("0 -23 Td")
        commands.append(f"({pdf_text(line)}) Tj")
    commands.extend([
        "ET",
        "BT /F2 7 Tf 12 71 Td (WEIGHT) Tj ET",
        "BT /F1 18 Tf 12 50 Td",
        f"({pdf_text(weight)}) Tj",
        "ET",
        "BT /F2 7 Tf 156 71 Td (QTY) Tj ET",
        "BT /F1 18 Tf 156 50 Td",
        f"({pdf_text(qty)}) Tj",
        "ET",
        "1.5 w 12 31 m 272 31 l S",
        "BT /F2 7 Tf 12 16 Td (PACKED ON) Tj ET",
        "BT /F1 15 Tf 182 14 Td",
        f"({pdf_text(packed_on)}) Tj",
        "ET"
    ])
    return "\n".join(commands).encode("latin-1", errors="replace")


def build_pdf(label, copies):
    width = 283.46
    height = 136.06
    objects = [None]

    def add_object(data):
        objects.append(data)
        return len(objects)

    pages_id = 1
    font_bold_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    font_regular_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    page_ids = []
    for _ in range(max(1, min(int(copies), 99))):
        stream = pdf_stream_for_label(label)
        content_id = add_object(
            b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
        )
        page = (
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {width:.2f} {height:.2f}] "
            f"/Resources << /Font << /F1 {font_bold_id} 0 R /F2 {font_regular_id} 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode("ascii")
        page_ids.append(add_object(page))

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    pages = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")
    objects[0] = pages
    catalog_id = add_object(b"<< /Type /Catalog /Pages 1 0 R >>")

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, data in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("ascii"))
        pdf.extend(data)
        pdf.extend(b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer << /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n".encode("ascii")
    )
    return bytes(pdf)


def split_raw_options(raw_options):
    options = []
    for token in str(raw_options or "").split():
        if token:
            options.extend(["-o", token])
    return options


def print_label(payload):
    settings = load_settings()
    settings.update(payload.get("settings") or {})
    label = payload.get("label") or {}
    copies = payload.get("copies") or 1
    pdf = build_pdf(label, copies)

    with tempfile.NamedTemporaryFile("wb", suffix=".pdf", delete=False) as temp_file:
        temp_file.write(pdf)
        temp_path = temp_file.name

    command = ["lp"]
    printer = settings.get("printer") or list_printers().get("defaultPrinter")
    if printer:
        command.extend(["-d", printer])
    media = settings.get("media")
    if media:
        command.extend(["-o", f"media={media}"])
    if settings.get("fitToPage"):
        command.extend(["-o", "fit-to-page"])
    if settings.get("orientation") == "landscape":
        command.extend(["-o", "landscape"])
    preset = settings.get("preset")
    if preset:
        command.extend(["-o", f"Preset={preset}"])
    command.extend(split_raw_options(settings.get("rawOptions")))
    command.append(temp_path)

    result = run_command(command)
    try:
        os.unlink(temp_path)
    except OSError:
        pass
    return {"ok": result["ok"], "command": command[:-1], "stdout": result["stdout"], "stderr": result["stderr"]}


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urlparse(path)
        clean_path = unquote(parsed.path).lstrip("/")
        if not clean_path:
            clean_path = "awc/index.html"
        target = (ROOT / clean_path).resolve()
        if not str(target).startswith(str(ROOT)):
            return str(ROOT / "awc/index.html")
        return str(target)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        if self.path == "/api/printers":
            self.send_json(200, list_printers())
            return
        if self.path == "/api/settings":
            self.send_json(200, load_settings())
            return
        super().do_GET()

    def do_POST(self):
        try:
            payload = self.read_json()
            if self.path == "/api/settings":
                self.send_json(200, save_settings(payload))
                return
            if self.path == "/api/print":
                result = print_label(payload)
                self.send_json(200 if result["ok"] else 500, result)
                return
            self.send_json(404, {"error": "Not found"})
        except Exception as error:
            self.send_json(500, {"error": str(error)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Label Print Station running at http://{HOST}:{PORT}/awc/")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
