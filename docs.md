# Simpsons Quote Quiz

Guess the episode from a random Frinkiac quote.

## Stack

- Static HTML/CSS/JS
- [BOOTSTRA.386](https://kristopolous.github.io/BOOTSTRA.386/) for styling
- [Frinkiac API](https://frinkiac.com/) for quotes/images
- Fuzzy matching via string similarity

## Types

```ts
// Frinkiac API response
type Episode = {
  Key: string           // "S01E11"
  Season: number        // 1
  EpisodeNumber: number // 11
  Title: string         // "The Crepes of Wrath"
}

type Frame = {
  Episode: string       // "S01E11"
  Timestamp: number     // 335897 (ms)
}

type Subtitle = {
  Content: string       // the quote text
}

type FrinkiacResponse = {
  Episode: Episode
  Frame: Frame
  Subtitles: Subtitle[]
}

// Game types
type HintType = "image" | "season" | "episodeNumber"

type GameState = {
  scene: FrinkiacResponse | null
  points: number
  revealed: Set<HintType>
  guessed: boolean
  won: boolean
}

type Config = {
  allowedSeasons: number[]           // [1,2,3,4,5]
  startingPoints: number             // 100
  hintCosts: Record<HintType, number>
  minQuoteWords: number              // 5
}
```

## Functions

```ts
// === Frinkiac API ===

fetchRandomScene(): Promise<FrinkiacResponse>
// GET https://frinkiac.com/api/random

getImageUrl(scene: FrinkiacResponse): string
// returns https://frinkiac.com/img/{Episode.Key}/{Frame.Timestamp}.jpg

// === Validation ===

isValidQuote(scene: FrinkiacResponse, config: Config): boolean
// - season in config.allowedSeasons
// - quote has >= config.minQuoteWords words
// - quote doesn't start with [ (rejects [GRUNTING] etc)

// === Game Logic ===

getValidScene(config: Config): Promise<FrinkiacResponse>
// loops fetchRandomScene until isValidQuote passes

revealHint(state: GameState, hint: HintType, config: Config): GameState
// deducts config.hintCosts[hint] from points
// adds hint to state.revealed

checkAnswer(state: GameState, guess: string): { correct: boolean, similarity: number }
// fuzzy match guess against scene.Episode.Title
// similarity threshold ~0.8 for "correct"

resetGame(config: Config): Promise<GameState>
// fetches new valid scene, resets to starting state

// === UI ===

render(state: GameState, config: Config): void
// updates DOM to reflect current state

setupAutocomplete(inputEl: HTMLInputElement, episodes: string[]): void
// attaches autocomplete behavior to input
```

## Config Defaults

```ts
const CONFIG: Config = {
  allowedSeasons: [1, 2, 3, 4, 5],
  startingPoints: 100,
  hintCosts: {
    image: 30,
    season: 20,
    episodeNumber: 40
  },
  minQuoteWords: 5
}
```

## File Structure

```
index.html       - game UI
style.css        - custom styles (on top of BOOTSTRA.386)
game.js          - all game logic
episodes.json    - S1-5 episode titles for autocomplete
```

## Frinkiac API Notes

- `GET /api/random` - random scene with episode + subtitles
- `GET /img/{EpisodeKey}/{Timestamp}.jpg` - screenshot image
- No auth required, CORS enabled

## Hosting (GitHub Pages)

1. Create a new GitHub repo (e.g., `simpsons-quiz`)
2. Push these files to the repo
3. Go to repo Settings > Pages
4. Source: Deploy from a branch
5. Branch: `main`, folder: `/ (root)`
6. Save and wait ~1 min
7. Site will be live at `https://username.github.io/simpsons-quiz/`

### Quick deploy

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:USERNAME/simpsons-quiz.git
git push -u origin main
```

Then enable Pages in repo settings.
