/** Which outside services are switched on. Demo mode replaces all of them with safe stand-ins. */
export const isDemo = () => process.env.DEMO_MODE === "true";
export const hasSupabase = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const hasStripe = () => !!process.env.STRIPE_SECRET_KEY;
export const hasPayPal = () => !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
export const hasResend = () => !!process.env.RESEND_API_KEY;
export const hasTwilio = () => !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM_NUMBER;
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
