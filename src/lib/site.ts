export const SITE = {
  name: "Akara Labs",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://akaralabs.in",
  tagline: "Giving form to ideas",
  email: process.env.CONTACT_EMAIL || "hello@akaralabs.in",
  whatsapp: process.env.CONTACT_WHATSAPP || "917082089049",
  city: "Chandigarh, India",
  gst: process.env.GST_NUMBER || "",
  instagram: process.env.SOCIAL_INSTAGRAM || "",
  linkedin: process.env.SOCIAL_LINKEDIN || "",
} as const;

export const GOOGLE_FONTS =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,460;0,6..72,500;1,6..72,420&family=Spectral:ital,wght@0,400;0,500;1,400&family=Schibsted+Grotesk:wght@400;500;600&family=Hanken+Grotesk:wght@400;460;500;560;600&family=IBM+Plex+Mono:wght@400;500&family=Anek+Devanagari:wght@400;500;600&display=swap";

/** Runs before paint so the theme never flashes. */
export const THEME_BOOTSTRAP = `(function(){var t=null;try{t=localStorage.getItem('akara-theme')}catch(e){}if(!t)t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';if(t==='light')document.documentElement.setAttribute('data-theme','light');})();`;
