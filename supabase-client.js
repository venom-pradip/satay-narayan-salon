// Initialize Supabase Client dynamically using window.env values
const supabaseUrl = window.env ? window.env.SUPABASE_URL : "";
const supabaseKey = window.env ? window.env.SUPABASE_ANON_KEY : "";

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase environment variables are missing! Ensure .env.js is loaded before this script.");
}

// Global Supabase Client instance
const supabaseClient = (typeof supabase !== 'undefined') 
  ? supabase.createClient(supabaseUrl, supabaseKey) 
  : null;

if (!supabaseClient) {
  console.error("Failed to initialize Supabase client library.");
} else {
  console.log("Supabase Client initialized successfully.");
}
