require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;

console.log('\n=== Google Gemini API Key Check ===\n');

if (!apiKey || apiKey === 'your-api-key-here' || apiKey.trim() === '') {
  console.log('❌ API Key Status: NOT CONFIGURED');
  console.log('\nTo fix this:');
  console.log('1. Create a file named .env in the server directory');
  console.log('2. Add the following line:');
  console.log('   GEMINI_API_KEY=your-actual-gemini-api-key-here');
  console.log('\nGet your API key from: https://makersuite.google.com/app/apikey\n');
  process.exit(1);
}

// Check if it looks like a valid Google API key format
const isValidFormat = apiKey.startsWith('AIza') && apiKey.length > 30;

if (!isValidFormat) {
  console.log('⚠️  API Key Status: INVALID FORMAT');
  console.log('Google Gemini API keys typically start with "AIza" and are longer than 30 characters.');
  console.log(`Your key starts with: ${apiKey.substring(0, 5)}...`);
  console.log(`Key length: ${apiKey.length} characters\n`);
} else {
  console.log('✅ API Key Status: FORMAT LOOKS VALID');
  console.log(`Key starts with: ${apiKey.substring(0, 7)}...`);
  console.log(`Key length: ${apiKey.length} characters\n`);
  
  // Try to make a simple API call to verify it works
  console.log('Testing API key with Google Gemini...');
  (async () => {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      const result = await model.generateContent('Say "Hello" if you can read this.');
      const response = await result.response;
      const text = response.text();
      
      console.log('✅ API Key is VALID and working!');
      console.log(`Test response: ${text.substring(0, 50)}...\n`);
      process.exit(0);
    } catch (error) {
      if (error.message && error.message.includes('API_KEY_INVALID')) {
        console.log('❌ API Key is INVALID or expired');
        console.log('Error: Invalid API key - Please check your API key');
      } else if (error.message && error.message.includes('quota')) {
        console.log('⚠️  API Key is valid but you have hit quota limits');
        console.log('This usually means the key works but you need to wait or upgrade your plan');
      } else {
        console.log('❌ Error testing API key:', error.message);
      }
      process.exit(1);
    }
  })();
}

