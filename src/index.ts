import dotenv from 'dotenv';
import { ArticleContentItem, JigsawLayout } from '@hyggeclub/models';
import { createClient, RedisClientType } from 'redis';
import express, { Request, Response } from 'express';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());


// Redis client initialization
const redisClient: RedisClientType = createClient({
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect()
  .then(() => console.log('Connected to Redis successfully'))
  .catch((err) => console.error('Failed to connect to Redis', err));

// Add this line to enable JSON body parsing
app.get('/test', (req, res) => {
    res.status(200).send('Service is running!');
});


app.post('/assign-layouts/:userId', async (req: Request, res: Response) => {
  const userId: string = req.params.userId;
  const articles: ArticleContentItem[] = req.body.articles;

  if (!articles) {
    return res.status(400).send({ message: "Missing 'articles' in request body" });
  }
  if (!userId) {
    console.log('anon layout')
  }

  try {
    const jigsawArticles = await assignJigsawLayout(userId, articles);
    res.status(200).json({ jigsawArticles });
  } catch (error) {
    console.error("Error assigning layouts:", error);
    res.status(500).send({ message: "Error assigning layouts" });
  }
});

app.listen(port, () => {
  console.log(`Service listening at http://localhost:${port}`);
});

async function fetchUserFeedSize(userId: string | null): Promise<number> {
  if (userId != null) {
    const personalizedFeedKey = `userPersonalizedFeed:sorted:${userId}`;
    try {
      const feedSize = await redisClient.zCard(personalizedFeedKey);
      return feedSize;
    } catch (error) {
      console.error('Error fetching user feed size from Redis:', error);
      return 0; // Fallback to 0 in case of any Redis errors
    }
  } else {
    const personalizedFeedKey = `anonComprehensiveFeed:sorted`;

    try {
      const feedSize = await redisClient.zCard(personalizedFeedKey);
      return feedSize;
    } catch (error) {
      console.error('Error fetching user feed size from Redis:', error);
      return 0; // Fallback to 0 in case of any Redis errors
    }
  }
}


function computeCompositeScore(article: ArticleContentItem): number {
  const hyggeWeight = 0.5; // Increased weight for hyggeScore
  const finalScoreWeight = 0.2; // Decreased weight to balance out the increase in other weights
  const recencyWeight = 0.3; // Increased weight for recency
  
  const hyggeComponent = article.hygge_score ? article.hygge_score * hyggeWeight : 0;
  const finalScoreComponent = article.final_score ? article.final_score * finalScoreWeight : 0;
  
  const currentDate = new Date();
  const articleDate = new Date(article.ingested_date);
  const recencyDays = Math.max((currentDate.getTime() - articleDate.getTime()) / (1000 * 3600 * 24), 1);
  const recencyScore = Math.max(10 - Math.log(recencyDays), 0); // Assuming the log-based recency score is desirable
  const recencyComponent = recencyScore * recencyWeight;
  
  return hyggeComponent + finalScoreComponent + recencyComponent;
}

async function assignJigsawLayout(userId: string | null, articles: ArticleContentItem[]): Promise<ArticleContentItem[]> {
  const feedSize = await fetchUserFeedSize(userId);
  const adjustmentFactor = adjustThresholdsBasedOnFeedSize(feedSize);
  const scores = articles.map(computeCompositeScore);
  const { prominentThreshold, averageThreshold } = calculateDynamicThresholds(scores, adjustmentFactor);

  return articles.map(article => {
    const compositeScore = computeCompositeScore(article);
    let layout: JigsawLayout;
    if (compositeScore > prominentThreshold) layout = 'prominent';
    else if (compositeScore > averageThreshold) layout = 'average';
    else layout = 'minor';
    return { ...article, jigsaw_layout: layout };
  });
}

function calculateDynamicThresholds(scores: number[], adjustmentFactor: number): { prominentThreshold: number; averageThreshold: number } {
  const sortedScores = [...scores].sort((a, b) => b - a);
  const prominentIndex = Math.floor(sortedScores.length * adjustmentFactor * 0.1); // Top 10% adjusted
  const averageIndex = Math.floor(sortedScores.length * adjustmentFactor * 0.5); // Top 50% adjusted

  // Ensure there's at least one prominent and average article if possible
  const prominentThreshold = sortedScores[prominentIndex] || 0;
  const averageThreshold = sortedScores[averageIndex] || 0;

  return {
    prominentThreshold,
    averageThreshold,
  };
}

function adjustThresholdsBasedOnFeedSize(feedSize: number): number {
  // Adjusted logic for smaller feed sizes
  if (feedSize > 250) return 1.1; // Slightly increase prominence for feeds larger than 250 articles
  else if (feedSize < 100) return 0.9; // Slightly decrease for feeds smaller than 100 articles to ensure quality
  return 1; // Default factor, no adjustment, for feeds between 100 and 250 articles
}

