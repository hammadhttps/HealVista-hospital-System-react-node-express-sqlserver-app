const BASE = process.env.API_BASE ?? "http://localhost:5000/api";
const PASSWORD = "demo1234";

const accounts = [
  ["admin", "mark@medicore.com"],
  ["receptionist", "reception@medicore.com"],
  ["doctor", "sarah@medicore.com"],
  ["pharmacist", "tom@medicore.com"],
  ["lab", "lab@medicore.com"],
  ["accountant", "linda@medicore.com"],
  ["patient", "alex@example.com"],
];

async function call(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

const results = [];
for (const [role, email] of accounts) {
  const login = await call("/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  const token = login.json?.data?.accessToken;
  if (!token) {
    results.push([role, "LOGIN FAIL", login.status, JSON.stringify(login.json).slice(0, 200)]);
    continue;
  }

  const me = await call("/auth/me", { token });
  const dashboard = await call("/dashboard", { token });
  results.push([
    role,
    "login+" + me.status,
    "dash+" + dashboard.status,
    `${me.json?.data?.role} | ${me.json?.data?.fullName ?? ""}`.trim(),
  ]);
}
for (const r of results) console.log(r.join("\t"));
