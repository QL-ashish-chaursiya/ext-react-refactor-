import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://mggvulbvgteamxghjoce.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZ3Z1bGJ2Z3RlYW14Z2hqb2NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2OTkxMjcsImV4cCI6MjA2MDI3NTEyN30.0mByptXZXPckzwAlEfnIFKAK219lUQ2OZLQwZH9hE4Y";
export const supabaseClient = createClient(supabaseUrl, supabaseKey);