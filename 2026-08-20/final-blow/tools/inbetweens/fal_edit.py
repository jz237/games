"""fal queue helper for image-to-image generation (gpt-image-2 edit).

Reads FAL_KEY from ~/.claude.json (mcpServers.fal.env.FAL_KEY) inside this
process only; the key is sent as a header and never printed or written.

Usage:
  python3 fal_edit.py --endpoint openai/gpt-image-2/edit --ref <png> \
      --prompt-file <txt> --out <png> [--size square_hd] [--background opaque] [--extra '{"json":1}']
  python3 fal_edit.py --schema openai/gpt-image-2/edit     # probe the input schema via a 422
"""
import argparse, base64, json, os, sys, time, urllib.request, urllib.error

def load_key():
    with open(os.path.expanduser("~/.claude.json")) as fh:
        cfg = json.load(fh)
    servers = cfg.get("mcpServers", {})
    for name, server in servers.items():
        env = server.get("env", {}) if isinstance(server, dict) else {}
        if "FAL_KEY" in env:
            return env["FAL_KEY"]
    raise SystemExit("FAL_KEY not found in ~/.claude.json mcpServers.*.env")

def request(url, key, payload=None, method=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"))
    req.add_header("Authorization", f"Key {key}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as err:
        body = err.read().decode(errors="replace")
        try:
            return err.code, json.loads(body)
        except Exception:
            return err.code, {"raw": body[:2000]}

def data_uri(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    mime = "image/png" if path.lower().endswith(".png") else "image/webp"
    return f"data:{mime};base64," + base64.b64encode(raw).decode()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", default="openai/gpt-image-2/edit")
    ap.add_argument("--ref", action="append", default=[])
    ap.add_argument("--prompt-file")
    ap.add_argument("--prompt")
    ap.add_argument("--out")
    ap.add_argument("--size", default="square_hd")
    ap.add_argument("--background", default=None)
    ap.add_argument("--extra", default=None)
    ap.add_argument("--schema", action="store_true")
    args = ap.parse_args()
    key = load_key()
    base = f"https://queue.fal.run/{args.endpoint}"
    if args.schema:
        status, body = request(base, key, {"__probe__": True})
        print(status, json.dumps(body, indent=1)[:3000])
        return
    prompt = args.prompt or open(args.prompt_file).read()
    payload = {"prompt": prompt, "image_size": args.size, "num_images": 1}
    if args.ref:
        payload["image_urls"] = [data_uri(p) for p in args.ref]
    if args.background:
        payload["background"] = args.background
    if args.extra:
        payload.update(json.loads(args.extra))
    status, body = request(base, key, payload)
    if status >= 400:
        print("submit failed", status, json.dumps(body, indent=1)[:3000]); sys.exit(1)
    request_id = body["request_id"]
    status_url = body.get("status_url") or f"{base}/requests/{request_id}/status"
    response_url = body.get("response_url") or f"{base}/requests/{request_id}"
    print("queued", request_id, flush=True)
    started = time.time()
    while True:
        time.sleep(4)
        status, body = request(status_url, key)
        st = body.get("status")
        if st == "COMPLETED":
            break
        if st in ("FAILED", "ERROR") or status >= 400:
            print("failed", status, json.dumps(body)[:2000]); sys.exit(1)
        if time.time() - started > 900:
            print("timeout"); sys.exit(1)
    status, result = request(response_url, key)
    images = result.get("images") or []
    if not images:
        print("no images", json.dumps(result)[:2000]); sys.exit(1)
    url = images[0]["url"]
    with urllib.request.urlopen(url, timeout=120) as resp:
        data = resp.read()
    with open(args.out, "wb") as fh:
        fh.write(data)
    print("saved", args.out, len(data), "bytes", images[0].get("width"), images[0].get("height"))

if __name__ == "__main__":
    main()
