import express from 'express';
import dotenv from 'dotenv';
import { ScoredArticle, JigsawArticle, JigsawLayout } from '@hyggeclub/models';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Add this line to enable JSON body parsing
app.use(express.json());

app.get('/test', (req, res) => {
    res.status(200).send('Service is running!');
});


app.get('/test', (req, res) => {
    res.status(200).send('Service is running!');
});


function computeCompositeScore(article: ScoredArticle): number {
  const hyggeWeight = 0.4;
  const finalScoreWeight = 0.4;
  const recencyWeight = 0.2;
  const hyggeComponent = article.hygge_score * hyggeWeight;
  const finalScoreComponent = article.final_score * finalScoreWeight;
  const currentDate = new Date();
  const articleDate = new Date(article.date);
  const recencyDays = Math.max((currentDate.getTime() - articleDate.getTime()) / (1000 * 3600 * 24), 1);
  const recencyScore = Math.max(10 - Math.log(recencyDays), 0);
  const recencyComponent = recencyScore * recencyWeight;
  return hyggeComponent + finalScoreComponent + recencyComponent;
}

function assignJigsawLayout(articles: ScoredArticle[]): JigsawArticle[] {
  return articles.map(article => {
      const compositeScore = computeCompositeScore(article);
      let layout: JigsawLayout;
      if (compositeScore > 12) layout = 'prominent';
      else if (compositeScore > 6) layout = 'average';
      else layout = 'minor';
      return { ...article, jigsaw_layout: layout };
  });
}

app.post('/assign-layouts', (req, res) => {
  if (!req.body.articles) {
      return res.status(400).send({ message: "Missing 'articles' in request body" });
  }
  console.log("assigning layouts");
  
  // Updated to correctly log the request body for debugging
  console.log(`body: ${JSON.stringify(req.body)}`);
  
  const scoredArticles: ScoredArticle[] = req.body.articles;
  const jigsawArticles = assignJigsawLayout(scoredArticles);
  res.status(200).json({ jigsawArticles });
});

app.listen(port, () => {
  console.log(`Service listening at http://localhost:${port}`);
});
