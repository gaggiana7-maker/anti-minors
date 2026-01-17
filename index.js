const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const Groq = require("groq-sdk");

console.log('🚀 ULTIMATE STRICT Age Bot Starting...');

// ==================== CONFIG ====================
const SERVER_ID = '1447204367089270874';
const LOG_CHANNEL_ID = '1457870506505011331';
const SPECIAL_CHANNEL_ID = '1447208095217619055';

// ==================== API KEYS ====================
const API_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_KEY_2,
  process.env.GROQ_KEY_3,
  process.env.GROQ_KEY_4,
  process.env.GROQ_KEY_5
].filter(key => key && key.trim() !== '');

console.log(`🔑 ${API_KEYS.length} keys loaded`);
let currentKeyIndex = 0;

function getCurrentKey() { return API_KEYS[currentKeyIndex]; }
function rotateKey() { currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length; }

async function askAI(prompt) {
  for (let attempt = 0; attempt < API_KEYS.length * 2; attempt++) {
    try {
      const groq = new Groq({ apiKey: getCurrentKey() });
      const response = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      return result;
      
    } catch (error) {
      console.log(`❌ Key ${currentKeyIndex} failed`);
      rotateKey();
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return { has_age_18_plus: false, is_minor: false, confidence: 'low', reason: 'AI failed - deleting for safety' };
}

// ==================== IMPROVED STRICT CHECK ====================
async function checkMessage(text) {
  const prompt = `You are analyzing a message in an adult NSFW server. Your ONLY job is to find the AGE of the PERSON WHO WROTE this message.

Message: "${text}"

CRITICAL INSTRUCTIONS:
1. Find the SENDER'S age (usually at start of message: "19m", "22f", "m21", etc.)
2. IGNORE all other numbers (preferences, measurements, "no under X", etc.)
3. If sender's age is 18 or above → has_age_18_plus = true
4. If sender's age is under 18 → is_minor = true
5. If NO age found → has_age_18_plus = false

EXAMPLES OF VALID 18+ (KEEP):
✅ "19m looking for fun" → age 19 (KEEP)
✅ "22m bottom with 7 inch" → age 22, ignore "7" (KEEP)
✅ "m21 bored dm" → age 21 (KEEP)
✅ "18 black vers no -19" → age 18, ignore "-19" preference (KEEP)
✅ "26m top 4 young twinks" → age 26, ignore "young" and "4" (KEEP)
✅ "20f dm open check bio" → age 20 (KEEP)
✅ "30 vers anyone?" → age 30 (KEEP)

EXAMPLES OF MINORS (FLAG + DELETE):
❌ "17m curious" → age 17 (MINOR)
❌ "16 looking for friends" → age 16 (MINOR)
❌ "61m reversed" → 16 reversed (MINOR)
❌ "51 swap" → 15 reversed (MINOR)
❌ "m15" → age 15 (MINOR)

EXAMPLES OF NO AGE (DELETE):
❌ "hey dm me" → no age
❌ "anyone here?" → no age
❌ "check bio" → no age
❌ "dms open" → no age
❌ "looking for fun" → no age

TRICKY CASES:
- "22m no under 18" → age 22 (KEEP, "under
