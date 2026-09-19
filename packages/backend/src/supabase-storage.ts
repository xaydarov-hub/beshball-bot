// Server-only Storage API adapter. Signed image URLs carry only a short-lived,
// object-specific token; the service key never reaches the admin browser.
export class SupabaseStorage {
  constructor(
    private readonly base: string,
    private readonly secret: string,
    private readonly bucket: string,
  ) {
    if (!base.startsWith("https://") || !secret)
      throw new Error("Supabase Storage configuration missing");
  }
  private objectPath(key: string) {
    if (key.split("/").some((part) => part === ".." || part === "." || !part))
      throw new Error("Invalid storage key");
    return `${encodeURIComponent(this.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  private async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.base}${path}`, {
      ...options,
      headers: {
        apikey: this.secret,
        Authorization: `Bearer ${this.secret}`,
        ...options.headers,
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`Supabase Storage request failed (${response.status})`);
    return response;
  }
  async initialize() {
    const buckets = (await (await this.request("/bucket")).json()) as {
      name: string;
      public: boolean;
    }[];
    const existing = buckets.find((item) => item.name === this.bucket);
    if (existing?.public) throw new Error("Receipt bucket must be private");
    if (!existing)
      await this.request("/bucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: this.bucket,
          name: this.bucket,
          public: false,
          file_size_limit: 8388608,
          allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
        }),
      });
  }
  async upload(key: string, body: Buffer, contentType: string) {
    await this.request(`/object/${this.objectPath(key)}`, {
      method: "POST",
      headers: { "Content-Type": contentType, "x-upsert": "true" },
      body: new Uint8Array(body),
    });
  }
  async read(key: string) {
    return Buffer.from(
      await (
        await this.request(`/object/${this.objectPath(key)}`)
      ).arrayBuffer(),
    );
  }
  async signed(key: string) {
    const data = (await (
      await this.request(`/object/sign/${this.objectPath(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 60 }),
      })
    ).json()) as { signedURL: string };
    if (!data.signedURL?.startsWith("/object/sign/"))
      throw new Error("Invalid signed storage URL");
    return `${this.base}${data.signedURL}`;
  }
  async delete(key: string) {
    this.objectPath(key);
    await this.request(`/object/${encodeURIComponent(this.bucket)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    });
  }
}
