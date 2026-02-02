export const NAVIGATE_TYPES = ["navigate", "System_Navigate"];
export const IMPORTANT_KEYS = [
  "Enter",
  "Tab",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];

// Map key to virtual key code
export const keyCodeMap = {
  Enter: 13,
  Tab: 9,
  Escape: 27,
  ArrowUp: 38,
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
};
export const codeMap = {
  Enter: "Enter",
  Tab: "Tab",
  Escape: "Escape",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
};
export const nonTextKeys = [
  "Escape",
  "Tab",
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];
export const IS_CUSTOM = ['randomName','randomNumber','randomAlphaNumeric','randomEmail']
export const SALT = "evertest-password-salt-v1";
export const ITERATIONS = 100_000;
export const KEY_LENGTH = 256;
export const ENVIRONMENTS = {
  development: {
    supabaseUrl: 'https://ikrclpndkyiznjiqrhcn.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrcmNscG5ka3lpem5qaXFyaGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0OTI5ODQsImV4cCI6MjA4NTA2ODk4NH0.T-R6iivxdODKCAabne0i3IU3ZIR5cCRC7P8Y63ya16E',
  },
  production: {
    supabaseUrl: 'https://mggvulbvgteamxghjoce.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nZ3Z1bGJ2Z3RlYW14Z2hqb2NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ2OTkxMjcsImV4cCI6MjA2MDI3NTEyN30.0mByptXZXPckzwAlEfnIFKAK219lUQ2OZLQwZH9hE4Y',
  },
};