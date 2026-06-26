const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL || "https://nwkuqgyurikqsojvosyr.supabase.co";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_vnGogOrLFdy88cpJ4Y77wQ_2deW8-4I";
const adminEmail = process.env.ADMIN_EMAIL || "admin@salon.com";

const content = `// Auto-generated during build
window.env = {
  SUPABASE_URL: "${supabaseUrl}",
  SUPABASE_ANON_KEY: "${supabaseKey}",
  ADMIN_EMAIL: "${adminEmail}"
};
`;

fs.writeFileSync('.env.js', content);
console.log('Environment configuration .env.js generated successfully.');
