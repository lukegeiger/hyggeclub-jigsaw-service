import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.get('/test', (req, res) => {
    res.status(200).send('Service is running!');
});

app.listen(port, () => {
  console.log(`Service listening at http://localhost:${port}`);
});
