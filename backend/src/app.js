import express from "express";

const app = express();


app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// Health check endpoint (useful for load balancers and Docker)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// TODO: We'll add more routes later

export default app;
