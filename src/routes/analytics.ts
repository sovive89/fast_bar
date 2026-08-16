import { Router } from "express";
import { analyzeMetrics } from "../services/openai";

const router = Router();

router.post("/analyze", async (req, res) => {
  try {
    const { question, metrics } = req.body;

    if (!question) {
      return res.status(400).json({
        error: "A pergunta é obrigatória.",
      });
    }

    const result = await analyzeMetrics(metrics ?? {}, question);

    return res.json({
      success: true,
      answer: result,
    });
  } catch (error) {
    console.error("Erro na análise:", error);

    return res.status(500).json({
      success: false,
      error: "Não foi possível realizar a análise.",
    });
  }
});

export default router;
