import { PrismaClient, type Prisma, ServiceKind } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const db = new PrismaClient();

export const DEMO_PASSWORD = "MateDemo2026";
async function demoHash(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(pw, salt, 64).toString("base64")}`;
}

// Suburb centroids (approximate) for the built-in maps provider: [name, state, postcode, lat, lng].
const SUBURBS: [string, string, string, number, number][] = [
  ["Sydney", "NSW", "2000", -33.8688, 151.2093], ["Parramatta", "NSW", "2150", -33.815, 151.0011], ["Bondi", "NSW", "2026", -33.8915, 151.2767],
  ["Chatswood", "NSW", "2067", -33.7969, 151.1803], ["Penrith", "NSW", "2750", -33.7507, 150.6877], ["Newtown", "NSW", "2042", -33.897, 151.179],
  ["Marrickville", "NSW", "2204", -33.911, 151.155], ["Surry Hills", "NSW", "2010", -33.8861, 151.2111], ["Manly", "NSW", "2095", -33.7969, 151.284],
  ["Blacktown", "NSW", "2148", -33.771, 150.906], ["Liverpool", "NSW", "2170", -33.92, 150.923], ["Hornsby", "NSW", "2077", -33.703, 151.099],
  ["Cronulla", "NSW", "2230", -34.058, 151.152], ["Strathfield", "NSW", "2135", -33.88, 151.083], ["Harris Park", "NSW", "2150", -33.823, 151.008],
  ["Melbourne", "VIC", "3000", -37.8136, 144.9631], ["Fitzroy", "VIC", "3065", -37.798, 144.978], ["Carlton", "VIC", "3053", -37.8, 144.967],
  ["Box Hill", "VIC", "3128", -37.819, 145.122], ["Footscray", "VIC", "3011", -37.8, 144.9], ["Richmond", "VIC", "3121", -37.823, 144.998],
  ["St Kilda", "VIC", "3182", -37.867, 144.98], ["Brunswick", "VIC", "3056", -37.767, 144.96], ["Dandenong", "VIC", "3175", -37.987, 145.215],
  ["Glen Waverley", "VIC", "3150", -37.878, 145.165], ["Werribee", "VIC", "3030", -37.9, 144.66],
  ["Brisbane City", "QLD", "4000", -27.4698, 153.0251], ["South Bank", "QLD", "4101", -27.481, 153.023], ["Paddington", "QLD", "4064", -27.46, 153.0],
  ["Fortitude Valley", "QLD", "4006", -27.457, 153.034], ["Surfers Paradise", "QLD", "4217", -28.002, 153.43], ["Sunnybank", "QLD", "4109", -27.58, 153.06],
  ["Chermside", "QLD", "4032", -27.385, 153.03],
  ["Perth", "WA", "6000", -31.9523, 115.8613], ["Northbridge", "WA", "6003", -31.947, 115.858], ["Fremantle", "WA", "6160", -32.056, 115.747],
  ["Subiaco", "WA", "6008", -31.949, 115.827], ["Joondalup", "WA", "6027", -31.745, 115.766], ["Scarborough", "WA", "6019", -31.894, 115.758],
  ["Adelaide", "SA", "5000", -34.9285, 138.6007], ["Glenelg", "SA", "5045", -34.98, 138.516], ["Norwood", "SA", "5067", -34.921, 138.63],
  ["Prospect", "SA", "5082", -34.885, 138.594],
  ["Canberra", "ACT", "2601", -35.2809, 149.13], ["Belconnen", "ACT", "2617", -35.238, 149.066],
  ["Hobart", "TAS", "7000", -42.8821, 147.3272], ["Launceston", "TAS", "7250", -41.4332, 147.1441], ["Darwin", "NT", "0800", -12.4634, 130.8456],
];

// Default message templates (Admin → Communications can edit). {{variables}} are filled at send time.
const T = (channel: "EMAIL" | "SMS" | "PUSH", event: string, body: string, subject?: string) => ({ channel, event, body, subject });
const TEMPLATES = [
  T("EMAIL", "OTP_CODE", "Your HIRE A MATE verification code is {{code}}.\n\nIt expires in {{minutes}} minutes. Never share this code with anyone, including someone claiming to be from HIRE A MATE.", "Your HIRE A MATE code: {{code}}"),
  T("SMS", "OTP_CODE", "HIRE A MATE code: {{code}}. Expires in {{minutes}} min. Never share it."),
  T("EMAIL", "WELCOME", "Hi {{name}},\n\nWelcome to HIRE A MATE. Your account is verified.\n\nNobody should miss out on life because they have nobody to go with.", "Welcome to HIRE A MATE"),
  T("EMAIL", "PASSWORD_CHANGED", "Hi {{name}},\n\nYour password was just changed and you were signed out of other devices. If this wasn't you, contact support immediately.", "Your password was changed"),
  T("SMS", "PASSWORD_CHANGED", "HIRE A MATE: your password was changed. Not you? Contact support now."),
  T("EMAIL", "BOOKING_REQUESTED", "Hi {{name}},\n\n{{customer}} has requested {{service}} on {{when}}.\n\nReview and accept or decline: {{link}}\n\nDeclining never affects your ranking.", "New booking request: {{service}}"),
  T("SMS", "BOOKING_REQUESTED", "HIRE A MATE: new request from {{customer}} for {{service}} on {{when}}. Respond in the app."),
  T("PUSH", "BOOKING_REQUESTED", "New request: {{service}} on {{when}}", "Booking request"),
  T("EMAIL", "BOOKING_ACCEPTED", "Hi {{name}},\n\n{{mate}} accepted your booking for {{service}} on {{when}}.\n\nPay to confirm: {{link}}", "{{mate}} accepted. Please pay to confirm"),
  T("SMS", "BOOKING_ACCEPTED", "HIRE A MATE: {{mate}} accepted {{service}} on {{when}}. Pay in the app to confirm."),
  T("EMAIL", "BOOKING_DECLINED", "Hi {{name}},\n\n{{mate}} can't take {{service}} on {{when}}. No payment was taken. Find another Mate: {{link}}", "Booking update: {{service}}"),
  T("EMAIL", "BOOKING_CONFIRMED", "Hi {{name}},\n\nYour booking for {{service}} on {{when}} is confirmed.\n\nDetails and messages: {{link}}", "Confirmed: {{service}} on {{when}}"),
  T("SMS", "BOOKING_CONFIRMED", "HIRE A MATE: {{service}} on {{when}} is confirmed."),
  T("EMAIL", "BOOKING_CANCELLED", "Hi {{name}},\n\nThe booking for {{service}} on {{when}} was cancelled. {{link}}", "Cancelled: {{service}}"),
  T("SMS", "BOOKING_CANCELLED", "HIRE A MATE: {{service}} on {{when}} was cancelled."),
  T("SMS", "MATE_ON_WAY", "HIRE A MATE: {{mate}} is on the way for {{service}}."),
  T("PUSH", "MATE_ON_WAY", "{{mate}} is on the way", "Mate on the way"),
  T("EMAIL", "BOOKING_COMPLETED", "Hi {{name}},\n\nThanks for using HIRE A MATE. How was {{service}}? Leave a review: {{link}}", "How was {{service}}?"),
  T("EMAIL", "PAYMENT_RECEIVED", "Hi {{name}},\n\nWe received your payment of {{amount}} for {{service}} on {{when}}. This email is your receipt.", "Receipt: {{amount}}"),
  T("EMAIL", "REFUND_PROCESSED", "Hi {{name}},\n\nWe've refunded {{amount}} for {{service}}. It can take 5–10 business days to appear.", "Refund processed: {{amount}}"),
  T("SMS", "REFUND_PROCESSED", "HIRE A MATE: refund of {{amount}} processed for {{service}}."),
  T("PUSH", "NEW_MESSAGE", "New message from {{sender}}", "New message"),
  T("EMAIL", "INTRO_RECEIVED", "Hi {{name}},\n\n{{customer}} introduced themselves and suggested an activity. Accept, decline or ask for more info: {{link}}", "{{customer}} introduced themselves"),
  T("EMAIL", "INTRO_ANSWERED", "Hi {{name}},\n\n{{mate}} replied to your introduction: {{link}}", "{{mate}} replied"),
  T("EMAIL", "MEMBERSHIP_ACTIVATED", "Hi {{name}},\n\n{{plan}} is now active. Manage your membership: {{link}}", "{{plan}} activated"),
  T("EMAIL", "MEMBERSHIP_CANCELLED", "Hi {{name}},\n\n{{plan}} has been cancelled and will end on {{date}}. You keep its features until then.", "{{plan}} cancelled"),
  T("EMAIL", "MATE_APPROVED", "Hi {{name}},\n\nYour Mate profile is approved and now appears in search. {{link}}", "You're live on HIRE A MATE"),
  T("EMAIL", "TICKET_UPDATED", "Hi {{name}},\n\nThere's an update on support ticket #{{number}}: {{link}}", "Support ticket #{{number}} updated"),
];

// v1.2 s5 proposed plans (AUD, subject to commercial review). Limits are enforced server-side.
const PLANS: Prisma.SubscriptionPlanCreateManyInput[] = [
  { slug: "customer-free", audience: "CUSTOMER", name: "Customer Free", description: "Everything you need to find and book a Mate.", monthlyCents: 0, annualCents: 0, sortOrder: 0,
    features: ["Browse and search Mates", "Make paid bookings", "10 saved favourites", "3 introductions a month", "Booking notifications"],
    limits: { favourites: 10, introductionsPerMonth: 3 } },
  { slug: "customer-plus", audience: "CUSTOMER", name: "Customer Plus", description: "More introductions and favourites.", monthlyCents: 999, annualCents: 9990, sortOrder: 1,
    features: ["Everything in Free", "50 saved favourites", "15 introductions a month"],
    limits: { favourites: 50, introductionsPerMonth: 15 } },
  { slug: "customer-premium", audience: "CUSTOMER", name: "Customer Premium", description: "Highest limits and priority support.", monthlyCents: 1999, annualCents: 19990, sortOrder: 2,
    features: ["Everything in Plus", "Unlimited favourites", "40 introductions a month", "Priority support"],
    limits: { favourites: 100000, introductionsPerMonth: 40 } },
  { slug: "mate-starter", audience: "MATE", name: "Mate Starter", description: "Verified profile and booking requests: free.", monthlyCents: 0, annualCents: 0, sortOrder: 0,
    features: ["Verified profile", "1 main + 9 gallery photos", "1 introduction video", "Service listings, prices, availability", "Receive and manage bookings", "Basic analytics"],
    limits: { galleryPhotos: 9, introVideos: 1, featuredEligible: false, analytics: "basic" } },
  { slug: "mate-plus", audience: "MATE", name: "Mate Plus", description: "Promotion eligibility and more media.", monthlyCents: 1999, annualCents: 19990, sortOrder: 1,
    features: ["Everything in Starter", "Featured placement eligibility", "2 videos", "Advanced analytics", "Promotional tools"],
    limits: { galleryPhotos: 9, introVideos: 2, featuredEligible: true, analytics: "advanced" } },
  { slug: "mate-professional", audience: "MATE", name: "Mate Professional", description: "Maximum media and customisation.", monthlyCents: 3999, annualCents: 39990, sortOrder: 2,
    features: ["Everything in Plus", "Up to 5 videos", "Advanced profile customisation", "Advanced business analytics"],
    limits: { galleryPhotos: 9, introVideos: 5, featuredEligible: true, analytics: "advanced" } },
];

type Svc = { slug: string; name: string; estMins?: number; minHours?: number; inc?: string[]; exc?: string[] };
type Cat = {
  slug: string;
  name: string;
  emoji: string;
  description: string;
  kind?: ServiceKind;
  parent?: string;
  active?: boolean;
  services: Svc[];
};

const HOUSEHOLD_EXCLUSIONS = [
  "Nursing, personal care or medication",
  "Electrical, plumbing or licensed trade work",
  "Childcare or unsupervised child supervision",
  "Handling the customer's money beyond the authorised spend",
];

// SRS 4 + Addendum s4: 16 navigation categories. Household subcategories hang off home-household.
const CATEGORIES: Cat[] = [
  {
    slug: "company-conversation", name: "Company & Conversation", emoji: "☕",
    description: "Coffee, conversation, movies and relaxed company.",
    services: [
      { slug: "coffee-mate", name: "Coffee Mate" },
      { slug: "conversation-mate", name: "Conversation Mate" },
      { slug: "movie-mate", name: "Movie Mate", minHours: 2 },
      { slug: "weekend-mate", name: "Weekend Mate", minHours: 2 },
      { slug: "virtual-mate", name: "Virtual Mate", inc: ["Video call on the platform"], exc: ["In-person meeting"] },
    ],
  },
  {
    slug: "dinner-socialising", name: "Dinner & Socialising", emoji: "🍽️",
    description: "Breakfast, lunch, dinner, picnics and food festivals.",
    services: [
      { slug: "dinner-mate", name: "Dinner Mate", minHours: 2 },
      { slug: "lunch-mate", name: "Lunch Mate" },
      { slug: "cafe-mate", name: "Cafe Mate" },
      { slug: "picnic-mate", name: "Picnic Mate", minHours: 2 },
    ],
  },
  {
    slug: "travel-adventure", name: "Travel & Adventure", emoji: "🧭", active: false, // SRS v1.3 s31: not in initial launch scope
    description: "Day trips, sightseeing, road trips and getaways.",
    services: [
      { slug: "sightseeing-mate", name: "Sightseeing Mate", minHours: 3 },
      { slug: "day-trip-mate", name: "Day Trip Mate", minHours: 6, exc: ["Overnight stays unless separately agreed", "Shared accommodation"] },
      { slug: "beach-mate", name: "Beach Mate", minHours: 2 },
    ],
  },
  {
    slug: "nightlife-parties", name: "Nightlife & Parties", emoji: "🎶",
    description: "Pubs, karaoke, concerts and celebrations.",
    services: [
      { slug: "concert-mate", name: "Concert Mate", minHours: 3, exc: ["Tickets unless agreed", "Guaranteed venue entry"] },
      { slug: "karaoke-mate", name: "Karaoke Mate", minHours: 2 },
      { slug: "pub-mate", name: "Pub Mate", minHours: 2, exc: ["Any obligation to drink alcohol"] },
    ],
  },
  {
    slug: "hobbies-activities", name: "Hobbies & Activities", emoji: "🎨",
    description: "Games, art, photography, music and crafts.",
    services: [
      { slug: "gaming-mate", name: "Gaming Mate" },
      { slug: "photography-mate", name: "Photography Mate", minHours: 2 },
      { slug: "art-mate", name: "Art Mate" },
    ],
  },
  {
    slug: "walking-fitness", name: "Walking & Fitness", emoji: "🚶",
    description: "Walks, hikes, tennis, golf and sport events.",
    services: [
      { slug: "walking-mate", name: "Walking Mate", exc: ["Personal training or health advice"] },
      { slug: "hiking-mate", name: "Hiking Mate", minHours: 3 },
      { slug: "tennis-mate", name: "Tennis Mate" },
    ],
  },
  {
    slug: "premium-experiences", name: "Premium Experiences", emoji: "✨",
    description: "Fine dining, exhibitions and professional events.",
    services: [
      { slug: "premium-dining-mate", name: "Premium Dining Mate", minHours: 2 },
      { slug: "networking-mate", name: "Networking Mate", minHours: 2, exc: ["Acting as your employee, representative or adviser"] },
      { slug: "exhibition-mate", name: "Exhibition Mate", minHours: 2 },
    ],
  },
  {
    slug: "community-connections", name: "Community Connections", emoji: "🤝",
    description: "New city, language practice, local events and clubs.",
    services: [
      { slug: "new-city-mate", name: "New City Mate", minHours: 2 },
      { slug: "language-mate", name: "Language Mate" },
      { slug: "local-event-mate", name: "Local Event Mate", minHours: 2 },
    ],
  },
  {
    slug: "home-household", name: "Home & Household Assistance", emoji: "🏠", kind: "HOUSEHOLD",
    description: "Practical, non-regulated help around the home.",
    services: [
      { slug: "general-household", name: "General household help", estMins: 60, exc: HOUSEHOLD_EXCLUSIONS },
      { slug: "parcel-errands", name: "Parcels, bins & errands", estMins: 45, exc: HOUSEHOLD_EXCLUSIONS },
      { slug: "wait-for-delivery", name: "Wait for authorised delivery/tradesperson", estMins: 120, exc: HOUSEHOLD_EXCLUSIONS },
    ],
  },
  {
    slug: "cleaning-housekeeping", name: "Cleaning & Housekeeping", emoji: "🧽", kind: "HOUSEHOLD", parent: "home-household",
    description: "Kitchens, bathrooms, vacuuming, linen and laundry.",
    services: [
      { slug: "kitchen-cleaning", name: "Kitchen cleaning", estMins: 60, exc: HOUSEHOLD_EXCLUSIONS },
      { slug: "bathroom-cleaning", name: "Bathroom & toilet cleaning", estMins: 45, exc: HOUSEHOLD_EXCLUSIONS },
      { slug: "vacuum-mop", name: "Vacuuming & mopping", estMins: 45, exc: HOUSEHOLD_EXCLUSIONS },
      { slug: "laundry", name: "Laundry & folding", estMins: 60, exc: HOUSEHOLD_EXCLUSIONS },
      { slug: "ironing", name: "Ironing", estMins: 45, exc: HOUSEHOLD_EXCLUSIONS },
      { slug: "bed-linen", name: "Changing bed linen", estMins: 20, exc: HOUSEHOLD_EXCLUSIONS },
    ],
  },
  {
    slug: "cooking-meals", name: "Cooking & Meal Preparation", emoji: "🍲", kind: "HOUSEHOLD", parent: "home-household",
    description: "Everyday cooking, weekly meal prep and kitchen clean-up.",
    services: [
      { slug: "dinner-prep", name: "Dinner preparation", estMins: 90, inc: ["Cooking with customer-supplied or purchased ingredients", "Kitchen clean-up"], exc: [...HOUSEHOLD_EXCLUSIONS, "Commercial catering"] },
      { slug: "weekly-meal-prep", name: "Meal prep for the week", estMins: 180, exc: HOUSEHOLD_EXCLUSIONS },
      { slug: "ingredient-prep", name: "Chopping & ingredient prep", estMins: 45, exc: HOUSEHOLD_EXCLUSIONS },
    ],
  },
  {
    slug: "shopping-errands", name: "Shopping & Everyday Errands", emoji: "🛒", kind: "HOUSEHOLD", parent: "home-household",
    description: "Groceries, household supplies and order collection.",
    services: [
      { slug: "grocery-shopping", name: "Grocery shopping", estMins: 60, inc: ["Shopping up to your authorised spend", "Receipt provided"], exc: HOUSEHOLD_EXCLUSIONS },
      { slug: "shopping-accompaniment", name: "Shopping accompaniment", estMins: 90 },
      { slug: "unpack-groceries", name: "Organising delivered groceries", estMins: 30, exc: HOUSEHOLD_EXCLUSIONS },
    ],
  },
  {
    slug: "gardening-organisation", name: "Gardening & Home Organisation", emoji: "🌿", kind: "HOUSEHOLD", parent: "home-household",
    description: "Garden tidy-ups, packing, unpacking and storage.",
    services: [
      { slug: "weeding-watering", name: "Weeding & watering", estMins: 60, exc: [...HOUSEHOLD_EXCLUSIONS, "Tree felling or high-risk machinery"] },
      { slug: "lawn-mowing", name: "Lawn mowing (with suitable equipment)", estMins: 60, exc: [...HOUSEHOLD_EXCLUSIONS, "Ride-on or high-risk machinery"] },
      { slug: "packing-unpacking", name: "Packing & unpacking", estMins: 120, exc: [...HOUSEHOLD_EXCLUSIONS, "Lifting beyond safe manual-handling limits"] },
      { slug: "wardrobe-organisation", name: "Wardrobe & storage organisation", estMins: 90, exc: HOUSEHOLD_EXCLUSIONS },
    ],
  },
  {
    slug: "short-term-companion", name: "Short-Term Companion", emoji: "⏱️",
    description: "A Mate for a few hours, an evening or a weekend activity.",
    services: [
      { slug: "evening-companion", name: "Evening Companion", minHours: 2 },
      { slug: "weekend-companion", name: "Weekend Companion", minHours: 3 },
      { slug: "activity-partner", name: "Activity Partner" },
      { slug: "museum-companion", name: "Museum or gallery companion", minHours: 2 },
    ],
  },
  {
    slug: "special-occasion", name: "Special Occasion Companion", emoji: "🎉",
    description: "Birthdays, weddings, graduations, awards and corporate events.",
    services: [
      { slug: "wedding-companion", name: "Wedding & reception companion", minHours: 4 },
      { slug: "birthday-companion", name: "Birthday celebration companion", minHours: 2 },
      { slug: "corporate-event-companion", name: "Corporate event companion", minHours: 3 },
    ],
  },
  {
    slug: "gifts-experiences", name: "Gifts & Experiences", emoji: "🎁", active: false,
    description: "Digital gifts and experience vouchers (coming soon).",
    services: [],
  },
];

// SRS 5.1 + Addendum s3. Labels only; the customer's choice is never persisted.
const NEEDS: [string, string, string[]][] = [
  ["bored", "I feel bored", ["hobbies-activities", "company-conversation", "short-term-companion"]],
  ["not-alone", "I don't want to be alone", ["company-conversation", "dinner-socialising"]],
  ["talk", "I want someone to talk to", ["company-conversation"]],
  ["out-tonight", "I want to go out tonight", ["nightlife-parties", "short-term-companion"]],
  ["dinner", "I want someone for dinner", ["dinner-socialising"]],
  ["travel", "I want a travel companion", ["travel-adventure"]],
  ["meet-people", "I want to meet new people", ["community-connections"]],
  ["regular", "I want a regular social companion", ["company-conversation", "walking-fitness"]],
  ["celebrate", "I want to celebrate something", ["special-occasion", "dinner-socialising"]],
  ["group", "I want to join a group activity", ["community-connections", "hobbies-activities"]],
  ["few-hours", "I need a Mate for a few hours", ["short-term-companion"]],
  ["evening", "I need an evening companion", ["short-term-companion", "nightlife-parties"]],
  ["occasion", "I need someone for a special occasion", ["special-occasion"]],
  ["weekend", "I need a weekend companion", ["short-term-companion", "travel-adventure"]],
  ["cleaning", "I need help cleaning my home", ["cleaning-housekeeping"]],
  ["cook", "I need someone to cook meals", ["cooking-meals"]],
  ["laundry", "I need help with laundry", ["cleaning-housekeeping"]],
  ["household", "I need help with household tasks", ["home-household", "cleaning-housekeeping"]],
  ["organise", "I need someone to organise my home", ["gardening-organisation"]],
  ["groceries", "I need help with groceries and shopping", ["shopping-errands"]],
  ["garden", "I need someone to help in the garden", ["gardening-organisation"]],
  ["regular-household", "I need a regular household Mate", ["home-household", "cleaning-housekeeping", "cooking-meals"]],
  ["gift", "I want to send someone a gift", ["gifts-experiences"]],
];

const RESTRICTED = [
  ["Nursing or personal care", "Clinical / regulated care requires a separately compliant service."],
  ["Medication administration", "Regulated activity."],
  ["Medical treatment", "Regulated activity."],
  ["Electrical, plumbing or licensed trade work", "Requires a licensed tradesperson."],
  ["Structural repairs", "Requires a licensed builder."],
  ["High-risk machinery operation", "Safety risk; may require a licence."],
  ["Childcare or unsupervised child supervision", "Requires Working With Children checks and a separate service framework."],
  ["Regulated disability (NDIS) or aged care services", "Requires registration and a compliant workforce."],
  ["Financial advice or handling customer funds", "Only the separately authorised shopping spend is permitted."],
  ["Counselling or mental health treatment", "Not a counselling service; refer to qualified professionals."],
  ["Paid passenger transport", "Requires separate authorisation."],
  ["Sexual or intimate services of any kind", "Strictly prohibited platform-wide."],
];

type MateSeed = {
  name: string; suburb: string; state: string; rate: number; hue: number;
  intro: string; langs: string[]; interests: string[]; qualities: string[]; services: string[];
  verified?: boolean; free?: number; group?: boolean; access?: boolean; sponsored?: boolean;
  minH?: number; maxH?: number; equipment?: string; insured?: boolean; experience?: string;
};

const MATES: MateSeed[] = [
  { name: "Priya", suburb: "Parramatta", state: "NSW", rate: 45, hue: 330, intro: "Coffee lover and keen walker who enjoys a good chat.", langs: ["English", "Hindi", "Punjabi"], interests: ["Cafes", "Bollywood films", "Walking"], qualities: ["Friendly", "Good listener", "Punctual"], services: ["coffee-mate", "conversation-mate", "walking-mate", "movie-mate", "language-mate"], verified: true, free: 30, access: true },
  { name: "Liam", suburb: "Bondi", state: "NSW", rate: 55, hue: 200, intro: "Beach, live music and showing visitors around Sydney.", langs: ["English"], interests: ["Surfing", "Live music", "Photography"], qualities: ["Outgoing", "Adventurous", "Humorous"], services: ["beach-mate", "concert-mate", "sightseeing-mate", "photography-mate", "pub-mate", "evening-companion"], verified: true, group: true, sponsored: true },
  { name: "Mei", suburb: "Chatswood", state: "NSW", rate: 50, hue: 15, intro: "Foodie who knows every dumpling spot on the North Shore.", langs: ["English", "Mandarin", "Cantonese"], interests: ["Food", "Museums", "Board games"], qualities: ["Cheerful", "Organised", "Considerate"], services: ["dinner-mate", "lunch-mate", "museum-companion", "gaming-mate", "language-mate", "new-city-mate"], verified: true, free: 30 },
  { name: "Grace", suburb: "Penrith", state: "NSW", rate: 42, hue: 140, intro: "Tidy, reliable and great in the kitchen. Happy to help weekly.", langs: ["English", "Tagalog"], interests: ["Cooking", "Gardening"], qualities: ["Reliable", "Organised", "Patient"], services: ["kitchen-cleaning", "bathroom-cleaning", "vacuum-mop", "laundry", "ironing", "bed-linen", "dinner-prep", "weekly-meal-prep", "grocery-shopping"], verified: true, minH: 2, maxH: 6, equipment: "Customer supplies cleaning products; I can bring a vacuum.", insured: true, experience: "6 years of household help for families and retirees." },
  { name: "Tom", suburb: "Fitzroy", state: "VIC", rate: 48, hue: 260, intro: "Gallery-goer, gig-goer and enthusiastic home cook.", langs: ["English"], interests: ["Art", "Indie music", "Cooking"], qualities: ["Creative", "Relaxed", "Conversational"], services: ["art-mate", "exhibition-mate", "concert-mate", "karaoke-mate", "evening-companion", "museum-companion"], verified: true, group: true },
  { name: "Sofia", suburb: "Carlton", state: "VIC", rate: 65, hue: 300, intro: "Event professional who's comfortable at weddings and corporate dinners.", langs: ["English", "Italian", "Spanish"], interests: ["Fine dining", "Theatre", "Wine regions"], qualities: ["Professional", "Sociable", "Welcoming"], services: ["premium-dining-mate", "networking-mate", "wedding-companion", "corporate-event-companion", "birthday-companion", "dinner-mate"], verified: true, minH: 2, maxH: 8 },
  { name: "Daniel", suburb: "Box Hill", state: "VIC", rate: 40, hue: 30, intro: "Practical helper: packing, gardens and moving days.", langs: ["English", "Greek"], interests: ["DIY", "Gardening", "Footy"], qualities: ["Helpful", "Dependable", "Energetic"], services: ["packing-unpacking", "weeding-watering", "lawn-mowing", "wardrobe-organisation", "general-household", "parcel-errands", "wait-for-delivery"], verified: true, minH: 2, maxH: 8, equipment: "I bring basic garden tools and a push mower.", insured: true, experience: "Helped with over 40 house moves." },
  { name: "Aisha", suburb: "Footscray", state: "VIC", rate: 38, hue: 100, intro: "Friendly walking and conversation Mate. Patient and calm.", langs: ["English", "Arabic", "Somali"], interests: ["Walking", "Reading", "Markets"], qualities: ["Patient", "Calm", "Respectful"], services: ["walking-mate", "conversation-mate", "coffee-mate", "shopping-accompaniment", "virtual-mate"], verified: true, free: 30, access: true },
  { name: "Jack", suburb: "South Bank", state: "QLD", rate: 47, hue: 50, intro: "Hiker, tennis player and Brisbane weekend explorer.", langs: ["English"], interests: ["Hiking", "Tennis", "Craft beer"], qualities: ["Active", "Outdoorsy", "Positive"], services: ["hiking-mate", "tennis-mate", "walking-mate", "weekend-companion", "day-trip-mate", "activity-partner"], verified: true, group: true },
  { name: "Hannah", suburb: "Paddington", state: "QLD", rate: 44, hue: 350, intro: "Cooking, meal prep and an organised pantry are my happy place.", langs: ["English", "German"], interests: ["Baking", "Organising", "Yoga"], qualities: ["Organised", "Cheerful", "Considerate"], services: ["dinner-prep", "weekly-meal-prep", "ingredient-prep", "unpack-groceries", "grocery-shopping", "wardrobe-organisation"], verified: true, minH: 2, maxH: 5, equipment: "Customer supplies ingredients and cookware.", experience: "Food Safety Supervisor certificate (checked)." },
  { name: "Arjun", suburb: "Northbridge", state: "WA", rate: 46, hue: 220, intro: "New to Perth once too — happy to show you around.", langs: ["English", "Tamil", "Hindi"], interests: ["Cricket", "Tech", "Street food"], qualities: ["Welcoming", "Conversational", "Reliable"], services: ["new-city-mate", "local-event-mate", "cafe-mate", "dinner-mate", "language-mate", "activity-partner"], verified: false, free: 30 },
  { name: "Chloe", suburb: "Glenelg", state: "SA", rate: 43, hue: 180, intro: "Beach walks, brunch and karaoke nights in Adelaide.", langs: ["English", "French"], interests: ["Brunch", "Karaoke", "Beach"], qualities: ["Cheerful", "Sociable", "Humorous"], services: ["beach-mate", "karaoke-mate", "cafe-mate", "lunch-mate", "birthday-companion", "picnic-mate"], verified: true, group: true },
  { name: "Ben", suburb: "Newtown", state: "NSW", rate: 52, hue: 280, intro: "Board games, indie cinema and pub trivia.", langs: ["English"], interests: ["Board games", "Cinema", "Trivia"], qualities: ["Humorous", "Relaxed", "Respectful"], services: ["gaming-mate", "movie-mate", "pub-mate", "weekend-mate", "evening-companion"], verified: true },
  { name: "Rosa", suburb: "Marrickville", state: "NSW", rate: 40, hue: 10, intro: "Home help with a smile: cleaning, laundry and errands.", langs: ["English", "Spanish", "Portuguese"], interests: ["Gardening", "Latin music"], qualities: ["Reliable", "Helpful", "Punctual"], services: ["kitchen-cleaning", "bathroom-cleaning", "vacuum-mop", "laundry", "ironing", "bed-linen", "weeding-watering", "parcel-errands", "general-household"], verified: true, minH: 2, maxH: 4, equipment: "I bring eco cleaning products on request.", insured: true, experience: "4 years of domestic cleaning." },
];

const ABOUT = (m: MateSeed) =>
  `Hi, I'm ${m.name}. I enjoy ${m.interests.join(", ").toLowerCase()} and meeting people from all walks of life. ` +
  `I offer friendly, platonic company and practical help within the boundaries listed below.`;

async function main() {
  // Reset in dependency order (dev seed only).
  await db.$transaction([
    db.block.deleteMany(), db.message.deleteMany(), db.report.deleteMany(), db.review.deleteMany(),
    db.supportTicketMessage.deleteMany(), db.supportTicket.deleteMany(),
    db.paymentTransaction.deleteMany(), db.userSubscription.deleteMany(), db.subscriptionPlan.deleteMany(),
    db.introduction.deleteMany(), db.favourite.deleteMany(), db.savedLocation.deleteMany(),
    db.notification.deleteMany(), db.notificationPreference.deleteMany(), db.deliveryLog.deleteMany(),
    db.session.deleteMany(), db.otpCode.deleteMany(), db.auditLog.deleteMany(),
    db.bookingTaskItem.deleteMany(), db.bookingMate.deleteMany(), db.booking.deleteMany(),
    db.groupParticipant.deleteMany(), db.groupActivity.deleteMany(),
    db.availability.deleteMany(), db.mateService.deleteMany(), db.mateProfile.deleteMany(),
    db.user.deleteMany(), db.service.deleteMany(), db.category.updateMany({ data: { parentId: null } }),
  ]);
  await db.category.deleteMany();
  await db.need.deleteMany();
  await db.restrictedTask.deleteMany();
  await db.suburb.deleteMany();
  await db.messageTemplate.deleteMany();

  await db.suburb.createMany({ data: SUBURBS.map(([name, state, postcode, lat, lng]) => ({ name, state, postcode, lat, lng })) });
  const sub = Object.fromEntries((await db.suburb.findMany()).map((s) => [s.name, s]));
  await db.messageTemplate.createMany({ data: TEMPLATES });
  await db.subscriptionPlan.createMany({ data: PLANS });
  for (const kind of ["EMAIL", "SMS", "PUSH"] as const) {
    await db.integrationSetting.upsert({ where: { kind }, create: { kind, provider: "console" }, update: {} });
  }
  await db.integrationSetting.upsert({ where: { kind: "MAPS" }, create: { kind: "MAPS", provider: "builtin" }, update: {} });
  await db.integrationSetting.upsert({ where: { kind: "PAYMENTS" }, create: { kind: "PAYMENTS", provider: "simulated" }, update: {} });

  // Demo accounts share one development password. Never use seeded data in production.
  const passwordHash = await demoHash(DEMO_PASSWORD);
  const verified = { emailVerifiedAt: new Date(), mobileVerifiedAt: new Date(), ageVerifiedAt: new Date(), ageVerificationMethod: "SEED", termsAcceptedAt: new Date(), passwordHash };

  const catId: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const created = await db.category.create({
      data: {
        slug: c.slug, name: c.name, emoji: c.emoji, description: c.description,
        kind: c.kind ?? "COMPANION", sortOrder: i, active: c.active ?? true,
        parentId: c.parent ? catId[c.parent] : undefined,
      },
    });
    catId[c.slug] = created.id;
    for (const s of c.services) {
      await db.service.create({
        data: {
          slug: s.slug, name: s.name, categoryId: created.id,
          estMins: s.estMins ?? 60, minHours: s.minHours ?? 1,
          inclusions: s.inc ?? ["Agreed activity for the booked time"],
          exclusions: s.exc ?? ["Sexual or intimate services", "Unpaid extra hours", "Tickets, food and transport unless agreed"],
        },
      });
    }
  }

  await db.need.createMany({
    data: NEEDS.map(([slug, label, categorySlugs], i) => ({
      slug, label, categorySlugs, sortOrder: i, active: slug !== "gift",
    })),
  });
  await db.restrictedTask.createMany({ data: RESTRICTED.map(([name, reason]) => ({ name, reason })) });

  const services = await db.service.findMany();
  const svcId = Object.fromEntries(services.map((s) => [s.slug, s.id]));

  const mateIds: string[] = [];
  for (const [i, m] of MATES.entries()) {
    const user = await db.user.create({
      data: {
        email: `${m.name.toLowerCase()}@mates.example`,
        mobile: `+614000000${String(i).padStart(2, "0")}`,
        legalName: `${m.name} Example`,
        displayName: m.name,
        dateOfBirth: new Date(1990 + (i % 8), i % 12, 10),
        role: "MATE",
        state: m.state,
        suburb: m.suburb,
        ...verified,
      },
    });
    const centre = sub[m.suburb];
    if (!centre) throw new Error(`Suburb missing from gazetteer: ${m.suburb}`);
    const profile = await db.mateProfile.create({
      data: {
        userId: user.id, displayName: m.name, intro: m.intro, about: ABOUT(m),
        serviceSuburb: m.suburb, state: m.state, serviceRadiusKm: 10 + (i % 4) * 5,
        hourlyRateCents: m.rate * 100, languages: m.langs, interests: m.interests, qualities: m.qualities,
        boundaries: "Public or agreed locations only. No alcohol obligation. Platonic company only. I may decline any request that doesn't suit me.",
        verified: m.verified ?? false, offersFreeFirstMeet: !!m.free, freeFirstMeetMins: m.free,
        groupAvailable: m.group ?? false, accessibilityAware: m.access ?? false, sponsored: m.sponsored ?? false,
        minBookingHours: m.minH ?? 1, maxBookingHours: m.maxH ?? 8, equipmentNote: m.equipment,
        insured: m.insured ?? false, experience: m.experience, avatarHue: m.hue, completedBookings: 3 + ((i * 7) % 25),
        status: m.verified === false ? "PENDING_REVIEW" : "APPROVED",
        lat: centre.lat, lng: centre.lng,
        acceptOutsideArea: !!m.equipment, // household Mates travel further, with a travel charge
        travelFeePerKmCents: m.equipment ? 80 : 0, minTravelFeeCents: m.equipment ? 500 : 0,
        services: { create: m.services.map((s) => ({ serviceId: svcId[s] })) },
        availability: {
          create: [1, 2, 3, 4, 5, 6, 0]
            .filter((d) => (d + i) % 3 !== 0)
            .map((weekday) => ({ weekday, startMin: weekday === 0 || weekday === 6 ? 9 * 60 : 16 * 60, endMin: 22 * 60 })),
        },
      },
    });
    mateIds.push(profile.id);
  }

  const alex = await db.user.create({
    data: { email: "alex@customers.example", mobile: "+61400000101", legalName: "Alex Customer", displayName: "Alex", dateOfBirth: new Date(1985, 4, 2), state: "NSW", suburb: "Surry Hills", ...verified },
  });
  const sam = await db.user.create({
    data: { email: "sam@customers.example", mobile: "+61400000102", legalName: "Sam Customer", displayName: "Sam", dateOfBirth: new Date(1958, 8, 21), state: "VIC", suburb: "Richmond", ...verified },
  });
  const STAFF: [string, string, string, "SUPER_ADMIN" | "CUSTOMER_SUPPORT" | "FINANCE_OFFICER" | "SAFETY_OFFICER" | "VERIFICATION_OFFICER"][] = [
    ["admin@hireamate.example", "+61400000100", "Admin", "SUPER_ADMIN"],
    ["casey@hireamate.example", "+61400000110", "Casey", "CUSTOMER_SUPPORT"],
    ["fiona@hireamate.example", "+61400000111", "Fiona", "FINANCE_OFFICER"],
    ["sasha@hireamate.example", "+61400000112", "Sasha", "SAFETY_OFFICER"],
    ["vic@hireamate.example", "+61400000113", "Vic", "VERIFICATION_OFFICER"],
  ];
  for (const [email, mobile, displayName, staffRole] of STAFF) {
    await db.user.create({ data: { email, mobile, legalName: `${displayName} Staff`, displayName, dateOfBirth: new Date(1980, 0, 1), role: "ADMIN", staffRole, ...verified } });
  }
  await db.savedLocation.create({ data: { userId: alex.id, label: "Home", address: "Surry Hills NSW 2010", lat: sub["Surry Hills"].lat, lng: sub["Surry Hills"].lng } });

  // Completed bookings with eligible reviews, so profiles show ratings.
  const past = (days: number, h: number) => new Date(Date.now() - days * 86400000 + h * 3600000);
  const reviewSeeds: [string, number, number, string][] = [
    ["coffee-mate", 0, 5, "Lovely chat over coffee, very easy to talk to."],
    ["concert-mate", 1, 5, "Made the gig so much more fun. Punctual and respectful."],
    ["dinner-mate", 2, 4, "Great restaurant recommendations!"],
    ["kitchen-cleaning", 3, 5, "Kitchen and bathroom spotless, and dinner prepped too."],
    ["art-mate", 4, 5, "Knowledgeable and relaxed gallery afternoon."],
    ["packing-unpacking", 6, 5, "Moving day went smoothly. Careful with our boxes."],
    ["walking-mate", 7, 5, "Patient and kind, kept to a gentle pace."],
    ["hiking-mate", 8, 4, "Good company on a long trail."],
    ["weekly-meal-prep", 9, 5, "A week of healthy meals sorted. Very tidy."],
  ];
  for (const [i, [svc, mateIdx, rating, comment]] of reviewSeeds.entries()) {
    const m = MATES[mateIdx];
    const amount = m.rate * 100 * 2;
    const booking = await db.booking.create({
      data: {
        customerId: i % 2 ? sam.id : alex.id, serviceId: svcId[svc],
        startsAt: past(20 + i, 0), endsAt: past(20 + i, 2), meetingPoint: `${m.suburb} (public meeting point)`,
        description: "Seeded completed booking", status: "COMPLETED", policyAcceptedAt: past(21 + i, 0),
        subtotalCents: amount, customerFeeCents: Math.round(amount * 0.05), totalCents: Math.round(amount * 1.05),
        mates: { create: { mateId: mateIds[mateIdx], response: "ACCEPTED", rateCents: m.rate * 100, amountCents: amount, respondedAt: past(21 + i, 0) } },
      },
    });
    await db.review.create({ data: { bookingId: booking.id, reviewerId: booking.customerId, mateId: mateIds[mateIdx], rating, comment } });
    // Keep the ledger consistent with seeded history so analytics add up.
    await db.booking.update({ where: { id: booking.id }, data: { paidAt: booking.startsAt } });
    const mateUser = await db.mateProfile.findUniqueOrThrow({ where: { id: mateIds[mateIdx] }, select: { userId: true } });
    await db.paymentTransaction.createMany({
      data: [
        { userId: booking.customerId, kind: "BOOKING_CAPTURE", status: "SUCCEEDED", amountCents: booking.totalCents, provider: "simulated", providerRef: `seed_ch_${booking.id}`, idempotencyKey: `booking:${booking.id}:charge:1`, bookingId: booking.id, description: "Booking payment (seed)", createdAt: booking.startsAt },
        { userId: mateUser.userId, kind: "MATE_PAYOUT", status: "SUCCEEDED", amountCents: Math.round(amount * 0.85), provider: "simulated", providerRef: `seed_po_${booking.id}`, idempotencyKey: `booking:${booking.id}:payout:${mateIds[mateIdx]}`, bookingId: booking.id, description: "Mate payout (seed)", createdAt: booking.endsAt },
      ],
    });
  }

  const soon = (days: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  await db.groupActivity.createMany({
    data: [
      { title: "Sunday coastal walk: Bondi to Coogee", description: "A relaxed 6 km walk with a coffee stop. All paces welcome.", categoryId: catId["walking-fitness"], hostMateId: mateIds[1], startsAt: soon(3, 9), durationMins: 150, suburb: "Bondi", state: "NSW", places: 10, priceCents: 1500, conditions: "Wear sun protection. Free cancellation up to 24 hours before." },
      { title: "Board game night", description: "Learn new games in a friendly group at a Newtown cafe.", categoryId: catId["hobbies-activities"], hostMateId: mateIds[12], startsAt: soon(5, 18), durationMins: 180, suburb: "Newtown", state: "NSW", places: 8, priceCents: 2000, conditions: "Cafe purchases are your own." },
      { title: "Laneway gallery crawl", description: "Three small galleries and a debrief over dumplings.", categoryId: catId["hobbies-activities"], hostMateId: mateIds[4], startsAt: soon(6, 14), durationMins: 180, suburb: "Fitzroy", state: "VIC", places: 6, priceCents: 2500, conditions: "Food at your own cost." },
      { title: "New in Perth? Welcome brunch", description: "Meet others who've recently moved to Perth.", categoryId: catId["community-connections"], hostMateId: mateIds[10], startsAt: soon(4, 10), durationMins: 120, suburb: "Northbridge", state: "WA", places: 12, priceCents: 0, visibility: "APPROVAL_REQUIRED", conditions: "Host approves each participant. Brunch at your own cost." },
    ],
  });

  console.log(`Seeded ${CATEGORIES.length} categories, ${services.length} services, ${MATES.length} Mates, ${NEEDS.length} needs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
