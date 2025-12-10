// === CONFIG ===
const CONFIG = {
  allowedSeasons: [1, 2, 3, 4, 5],
  startingPoints: 100,
  hintCosts: {
    image: 30,
    season: 20,
    episodeNumber: 40
  },
  minQuoteWords: 5,
  similarityThreshold: 0.75
};

// === STATE ===
let state = {
  scene: null,
  points: CONFIG.startingPoints,
  revealed: new Set(),
  guessed: false,
  won: false
};

let episodes = [];

// === DOM ELEMENTS ===
const els = {
  score: document.getElementById('score'),
  quoteText: document.getElementById('quote-text'),
  revealedPanel: document.getElementById('revealed-panel'),
  imageContainer: document.getElementById('image-container'),
  sceneImage: document.getElementById('scene-image'),
  revealImage: document.getElementById('reveal-image'),
  revealSeason: document.getElementById('reveal-season'),
  revealEpisode: document.getElementById('reveal-episode'),
  seasonHint: document.getElementById('season-hint'),
  seasonValue: document.getElementById('season-value'),
  episodeHint: document.getElementById('episode-hint'),
  episodeValue: document.getElementById('episode-value'),
  guessInput: document.getElementById('guess-input'),
  autocompleteList: document.getElementById('autocomplete-list'),
  submitGuess: document.getElementById('submit-guess'),
  resultPanel: document.getElementById('result-panel'),
  resultText: document.getElementById('result-text'),
  correctAnswer: document.getElementById('correct-answer'),
  finalScore: document.getElementById('final-score'),
  playAgain: document.getElementById('play-again'),
  loading: document.getElementById('loading')
};

// === FRINKIAC API ===
// Using CORS proxy since Frinkiac doesn't allow browser requests
const CORS_PROXY = 'https://corsproxy.io/?';

async function fetchRandomScene() {
  const cacheBuster = Date.now();
  const response = await fetch(CORS_PROXY + encodeURIComponent('https://frinkiac.com/api/random?t=' + cacheBuster));
  return response.json();
}

function getImageUrl(scene) {
  // Images work without CORS proxy
  return `https://frinkiac.com/img/${scene.Frame.Episode}/${scene.Frame.Timestamp}.jpg`;
}

// === VALIDATION ===
function getQuoteText(scene) {
  if (!scene.Subtitles || scene.Subtitles.length === 0) return '';
  return scene.Subtitles.map(s => s.Content).join(' ');
}

function isValidQuote(scene) {
  // Check season
  const season = scene.Episode.Season;
  if (!CONFIG.allowedSeasons.includes(season)) return false;

  // Check quote content
  const quote = getQuoteText(scene);
  if (!quote) return false;

  // Check minimum words
  const words = quote.trim().split(/\s+/);
  if (words.length < CONFIG.minQuoteWords) return false;

  // Reject sound effects like [GRUNTING]
  if (quote.trim().startsWith('[')) return false;

  // Reject if mostly uppercase bracketed content (sound effects)
  const bracketedContent = quote.match(/\[[^\]]+\]/g);
  if (bracketedContent) {
    const bracketedLength = bracketedContent.join('').length;
    if (bracketedLength > quote.length * 0.5) return false;
  }

  return true;
}

async function getValidScene() {
  let attempts = 0;
  const maxAttempts = 50;

  while (attempts < maxAttempts) {
    const scene = await fetchRandomScene();
    if (isValidQuote(scene)) {
      return scene;
    }
    attempts++;
  }

  throw new Error('Could not find valid scene after ' + maxAttempts + ' attempts');
}

// === FUZZY MATCHING ===
function normalizeString(str) {
  return str
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarity(a, b) {
  const normA = normalizeString(a);
  const normB = normalizeString(b);

  if (normA === normB) return 1;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(normA, normB);
  return 1 - (distance / maxLen);
}

function checkAnswer(guess) {
  const correctTitle = state.scene.Episode.Title;
  const sim = similarity(guess, correctTitle);
  return {
    correct: sim >= CONFIG.similarityThreshold,
    similarity: sim,
    actualTitle: correctTitle
  };
}

// === GAME LOGIC ===
function revealHint(hintType) {
  if (state.revealed.has(hintType) || state.guessed) return;

  state.points -= CONFIG.hintCosts[hintType];
  state.points = Math.max(0, state.points);
  state.revealed.add(hintType);

  render();
}

async function resetGame() {
  els.loading.style.display = 'block';
  els.resultPanel.style.display = 'none';

  try {
    state = {
      scene: await getValidScene(),
      points: CONFIG.startingPoints,
      revealed: new Set(),
      guessed: false,
      won: false
    };

    els.guessInput.value = '';
    els.autocompleteList.classList.remove('active');
    render();
  } catch (err) {
    els.quoteText.textContent = 'Error loading quote. Please refresh the page.';
    console.error(err);
  } finally {
    els.loading.style.display = 'none';
  }
}

function submitGuess() {
  if (state.guessed) return;

  const guess = els.guessInput.value.trim();
  if (!guess) return;

  const result = checkAnswer(guess);
  state.guessed = true;
  state.won = result.correct;

  if (!state.won) {
    state.points = 0;
  }

  render();
  showResult(result);
}

function showResult(result) {
  els.resultPanel.style.display = 'block';

  if (result.correct) {
    els.resultText.textContent = 'CORRECT!';
    els.resultText.className = 'correct';
  } else {
    els.resultText.textContent = 'WRONG!';
    els.resultText.className = 'incorrect';
  }

  els.correctAnswer.textContent = `The episode was: "${result.actualTitle}"`;
  els.finalScore.textContent = `Final score: ${state.points} points`;

  // Reveal everything on game end
  state.revealed.add('image');
  state.revealed.add('season');
  state.revealed.add('episodeNumber');
  render();
}

// === RENDERING ===
function render() {
  // Score
  els.score.textContent = state.points;

  if (!state.scene) return;

  // Quote
  els.quoteText.textContent = getQuoteText(state.scene);

  // Show revealed panel if anything is revealed
  const hasAnyRevealed = state.revealed.size > 0;
  els.revealedPanel.style.display = hasAnyRevealed ? 'block' : 'none';

  // Image
  if (state.revealed.has('image')) {
    els.imageContainer.style.display = 'block';
    els.sceneImage.src = getImageUrl(state.scene);
    els.revealImage.disabled = true;
  } else {
    els.imageContainer.style.display = 'none';
    els.revealImage.disabled = false;
  }

  // Season hint
  if (state.revealed.has('season')) {
    els.seasonHint.style.display = 'block';
    els.seasonValue.textContent = state.scene.Episode.Season;
    els.revealSeason.disabled = true;
  } else {
    els.seasonHint.style.display = 'none';
    els.revealSeason.disabled = false;
  }

  // Episode hint
  if (state.revealed.has('episodeNumber')) {
    els.episodeHint.style.display = 'block';
    els.episodeValue.textContent = state.scene.Episode.EpisodeNumber;
    els.revealEpisode.disabled = true;
  } else {
    els.episodeHint.style.display = 'none';
    els.revealEpisode.disabled = false;
  }

  // Disable inputs if guessed
  if (state.guessed) {
    els.guessInput.disabled = true;
    els.submitGuess.disabled = true;
    els.revealImage.disabled = true;
    els.revealSeason.disabled = true;
    els.revealEpisode.disabled = true;
  } else {
    els.guessInput.disabled = false;
    els.submitGuess.disabled = false;
  }
}

// === AUTOCOMPLETE ===
function setupAutocomplete() {
  let selectedIndex = -1;

  els.guessInput.addEventListener('input', () => {
    const value = els.guessInput.value.toLowerCase().trim();

    if (value.length < 1) {
      els.autocompleteList.classList.remove('active');
      return;
    }

    const matches = episodes
      .filter(ep => ep.title.toLowerCase().includes(value))
      .slice(0, 8);

    if (matches.length === 0) {
      els.autocompleteList.classList.remove('active');
      return;
    }

    els.autocompleteList.innerHTML = matches
      .map((ep, i) => `<li data-index="${i}" data-title="${ep.title}">${ep.title}</li>`)
      .join('');

    els.autocompleteList.classList.add('active');
    selectedIndex = -1;
  });

  els.guessInput.addEventListener('keydown', (e) => {
    const items = els.autocompleteList.querySelectorAll('li');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      updateSelection(items);
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && items[selectedIndex]) {
        e.preventDefault();
        els.guessInput.value = items[selectedIndex].dataset.title;
        els.autocompleteList.classList.remove('active');
      } else if (els.guessInput.value.trim()) {
        submitGuess();
      }
    } else if (e.key === 'Escape') {
      els.autocompleteList.classList.remove('active');
    }
  });

  els.autocompleteList.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
      els.guessInput.value = e.target.dataset.title;
      els.autocompleteList.classList.remove('active');
    }
  });

  // Close autocomplete when clicking outside
  document.addEventListener('click', (e) => {
    if (!els.guessInput.contains(e.target) && !els.autocompleteList.contains(e.target)) {
      els.autocompleteList.classList.remove('active');
    }
  });

  function updateSelection(items) {
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === selectedIndex);
    });
  }
}

// === INIT ===
async function init() {
  // Load episodes
  try {
    const response = await fetch('episodes.json');
    const data = await response.json();
    episodes = data.episodes;
  } catch (err) {
    console.error('Failed to load episodes:', err);
  }

  // Setup event listeners
  els.revealImage.addEventListener('click', () => revealHint('image'));
  els.revealSeason.addEventListener('click', () => revealHint('season'));
  els.revealEpisode.addEventListener('click', () => revealHint('episodeNumber'));
  els.submitGuess.addEventListener('click', submitGuess);
  els.playAgain.addEventListener('click', resetGame);

  setupAutocomplete();

  // Start game
  await resetGame();
}

init();
