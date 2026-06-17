import { useState } from "react";
import { signInWithEmail } from "../../services/auth";

export default function LoginPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await signInWithEmail(email, password);
    setLoading(false);
    if (error) setError(error.message);
  }

  return (
    <div className="accessGate">
      <form className="accessPanel" onSubmit={submit}>
        <h1>H&H Production Manager</h1>
        <p className="muted">Sign in with your shop account.</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="bad">{error}</p>}
        <button className="primary wide" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button>
      </form>
    </div>
  );
}
