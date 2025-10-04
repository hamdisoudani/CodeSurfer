import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";

export function getGroqModel() {
  const provider = (process.env.PROVIDER || "").toLowerCase();
  const useGroq = provider === "groq" || process.env.IS_GROQ === "true";
  const temperature = process.env.LLM_TEMPERATURE
    ? Number(process.env.LLM_TEMPERATURE)
    : undefined;

  if (useGroq) {
    const model = process.env.GROQ_MODEL;
    const apiKey = process.env.GROQ_API_KEY;
    if (!model) throw new Error("GROQ_MODEL is not set");
    if (!apiKey) throw new Error("GROQ_API_KEY is not set");
    return new ChatGroq({ model, apiKey, streaming: true, temperature });
  }

  const model = process.env.OPENAI_MODEL;
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || process.env.BASE_URL;
  console.log("Used openai model configuration ", { model, apiKey, baseURL });
  const instanceOfOpenAiModel = new ChatOpenAI({
    model: model, // Set your model name
    apiKey: "glhf_5c9c5bc329b30599e7d9c3374439c971", // Put your custom API key here
    configuration: {
      baseURL: baseURL, // Custom base URL
    },
    streaming: false,
    modelKwargs: {
      
    }
    
    // (optionally other params)
  });
  return instanceOfOpenAiModel;
}


