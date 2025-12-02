import { useState } from "react";

function App() {
  const [url, setUrl] = useState("");
  const [coupons, setCoupons] = useState([]);

  const scrape = async () => {
    const res = await fetch("http://localhost:3001/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();
    setCoupons(data.coupons || []);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>AI Coupon Finder</h1>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com"
        style={{ width: "300px" }}
      />
      <button onClick={scrape}>Find Coupons</button>

      <pre>{JSON.stringify(coupons, null, 2)}</pre>
    </div>
  );
}

export default App;
