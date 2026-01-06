"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [tvUsername, setTvUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // Get user ID from URL parameters (Whop passes this)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userIdParam = params.get('user_id') || params.get('userId');
    setUserId(userIdParam);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userId) {
      setMessage("❌ User authentication failed");
      return;
    }
    
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/grant-access", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          tradingviewUsername: tvUsername,
          whopUserId: userId,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage("✅ Access granted successfully!");
        setTvUsername("");
      } else {
        setMessage(`❌ ${data.error || 'Failed to grant access'}`);
      }
    } catch (error) {
      setMessage("❌ An error occurred");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 max-w-md w-full border border-gray-700">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            TradingView Access
          </h1>
          <p className="text-gray-400">
            Enter your TradingView username to get indicator access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label 
              htmlFor="username" 
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              TradingView Username
            </label>
            <input
              id="username"
              type="text"
              value={tvUsername}
              onChange={(e) => setTvUsername(e.target.value)}
              placeholder="Enter your username"
              required
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !tvUsername || !userId}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              "Grant Access"
            )}
          </button>
        </form>

        {message && (
          <div className={`mt-6 p-4 rounded-lg text-center ${
            message.includes("✅") 
              ? "bg-green-900/50 text-green-200 border border-green-700" 
              : "bg-red-900/50 text-red-200 border border-red-700"
          }`}>
            {message}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-gray-400">
          <p>Make sure your TradingView username is correct!</p>
        </div>
      </div>
    </main>
  );
}