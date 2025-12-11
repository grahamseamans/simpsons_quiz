// === CONFIG ===
const CONFIG = {
  startingPoints: 100,
  hintCosts: {
    image: 30,
    season: 20,
    episodeNumber: 40
  },
  bonusPoints: {
    season: 25,
    episode: 50
  },
  minQuoteWords: 5,
  similarityThreshold: 0.75
};

// === STATE ===
let state = {
  scene: null,
  roundPoints: CONFIG.startingPoints,
  totalPoints: 0,
  roundsPlayed: 0,
  revealed: new Set(),
  guessed: false,
  won: false,
  seasonRange: { min: 1, max: 9 }
};

let episodes = [];

// === DOM ELEMENTS ===
const els = {
  // Settings
  seasonMin: document.getElementById('season-min'),
  seasonMax: document.getElementById('season-max'),

  // Stats
  totalScore: document.getElementById('total-score'),
  roundScore: document.getElementById('round-score'),
  roundsPlayed: document.getElementById('rounds-played'),

  // Panels
  gamePanel: document.getElementById('game-panel'),

  // Quote
  quoteText: document.getElementById('quote-text'),

  // Revealed hints
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

  // Guess inputs
  guessInput: document.getElementById('guess-input'),
  autocompleteList: document.getElementById('autocomplete-list'),
  guessSeason: document.getElementById('guess-season'),
  guessEpisode: document.getElementById('guess-episode'),
  submitGuess: document.getElementById('submit-guess'),

  // Result panel
  resultPanel: document.getElementById('result-panel'),
  resultText: document.getElementById('result-text'),
  resultImage: document.getElementById('result-image'),
  resultEpisodeInfo: document.getElementById('result-episode-info'),
  bonusResult: document.getElementById('bonus-result'),
  roundScoreResult: document.getElementById('round-score-result'),
  sessionTotal: document.getElementById('session-total'),
  sessionRounds: document.getElementById('session-rounds'),
  sessionAvg: document.getElementById('session-avg'),
  nextRound: document.getElementById('next-round'),

  loading: document.getElementById('loading')
};

// === FRINKIAC API ===
const CORS_PROXY = 'https://corsproxy.io/?';

async function fetchRandomScene() {
  const cacheBuster = Date.now();
  const response = await fetch(CORS_PROXY + encodeURIComponent('https://frinkiac.com/api/random?t=' + cacheBuster));
  return response.json();
}

function getImageUrl(scene) {
  return `https://frinkiac.com/img/${scene.Frame.Episode}/${scene.Frame.Timestamp}.jpg`;
}

// === VALIDATION ===
function getQuoteText(scene) {
  if (!scene.Subtitles || scene.Subtitles.length === 0) return '';
  return scene.Subtitles.map(s => s.Content).join(' ');
}

function isValidQuote(scene) {
  const season = scene.Episode.Season;
  if (season < state.seasonRange.min || season > state.seasonRange.max) return false;

  const quote = getQuoteText(scene);
  if (!quote) return false;

  const words = quote.trim().split(/\s+/);
  if (words.length < CONFIG.minQuoteWords) return false;

  if (quote.trim().startsWith('[')) return false;

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

  state.roundPoints -= CONFIG.hintCosts[hintType];
  state.roundPoints = Math.max(0, state.roundPoints);
  state.revealed.add(hintType);

  render();
}

function getSeasonRange() {
  const min = parseInt(els.seasonMin.value) || 1;
  const max = parseInt(els.seasonMax.value) || 9;
  return {
    min: Math.max(1, Math.min(min, max)),
    max: Math.min(20, Math.max(min, max))
  };
}

async function startNewRound() {
  els.loading.style.display = 'block';
  els.resultPanel.style.display = 'none';
  els.gamePanel.style.display = 'block';

  // Update season range from inputs
  state.seasonRange = getSeasonRange();

  try {
    state.scene = await getValidScene();
    state.roundPoints = CONFIG.startingPoints;
    state.revealed = new Set();
    state.guessed = false;
    state.won = false;

    // Clear inputs
    els.guessInput.value = '';
    els.guessSeason.value = '';
    els.guessEpisode.value = '';
    els.autocompleteList.classList.remove('active');

    // Re-enable inputs
    els.guessInput.disabled = false;
    els.guessSeason.disabled = false;
    els.guessEpisode.disabled = false;
    els.submitGuess.disabled = false;

    render();
  } catch (err) {
    els.quoteText.textContent = 'Error loading quote. Try adjusting your season range and refresh.';
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

  // Calculate bonus points
  let bonusText = [];
  let bonusPoints = 0;

  const guessedSeason = parseInt(els.guessSeason.value);
  const guessedEpisode = parseInt(els.guessEpisode.value);
  const actualSeason = state.scene.Episode.Season;
  const actualEpisode = state.scene.Episode.EpisodeNumber;

  if (guessedSeason && guessedSeason === actualSeason) {
    bonusPoints += CONFIG.bonusPoints.season;
    bonusText.push(`Season correct! +${CONFIG.bonusPoints.season}`);
  } else if (guessedSeason) {
    bonusText.push(`Season: guessed ${guessedSeason}, was ${actualSeason}`);
  }

  if (guessedEpisode && guessedEpisode === actualEpisode) {
    bonusPoints += CONFIG.bonusPoints.episode;
    bonusText.push(`Episode # correct! +${CONFIG.bonusPoints.episode}`);
  } else if (guessedEpisode) {
    bonusText.push(`Episode: guessed ${guessedEpisode}, was ${actualEpisode}`);
  }

  // Final round score
  if (!state.won) {
    state.roundPoints = 0;
  }
  state.roundPoints += bonusPoints;

  // Update totals
  state.totalPoints += state.roundPoints;
  state.roundsPlayed++;

  // Show result
  showResult(result, bonusText);
}

function showResult(result, bonusText) {
  els.gamePanel.style.display = 'none';
  els.resultPanel.style.display = 'block';

  if (result.correct) {
    els.resultText.textContent = 'CORRECT!';
    els.resultText.className = 'correct';
  } else {
    els.resultText.textContent = 'WRONG!';
    els.resultText.className = 'incorrect';
  }

  // Show image
  els.resultImage.src = getImageUrl(state.scene);

  // Show episode info
  const ep = state.scene.Episode;
  els.resultEpisodeInfo.innerHTML = `<b>Season ${ep.Season}, Episode ${ep.EpisodeNumber}:</b> "${ep.Title}"`;

  // Show bonus results
  if (bonusText.length > 0) {
    els.bonusResult.innerHTML = bonusText.join('<br>');
  } else {
    els.bonusResult.textContent = '';
  }

  // Show round score
  els.roundScoreResult.innerHTML = `<b>Round Score:</b> ${state.roundPoints} pts`;

  // Show session stats
  els.sessionTotal.textContent = state.totalPoints;
  els.sessionRounds.textContent = state.roundsPlayed;
  els.sessionAvg.textContent = (state.totalPoints / state.roundsPlayed).toFixed(1);

  // Disable inputs
  els.guessInput.disabled = true;
  els.guessSeason.disabled = true;
  els.guessEpisode.disabled = true;
  els.submitGuess.disabled = true;
}

// === RENDERING ===
function render() {
  // Stats
  els.totalScore.textContent = state.totalPoints;
  els.roundScore.textContent = state.roundPoints;
  els.roundsPlayed.textContent = state.roundsPlayed;

  if (!state.scene) return;

  // Quote
  els.quoteText.textContent = getQuoteText(state.scene);

  // Show revealed panel if anything is revealed
  const hasAnyRevealed = state.revealed.size > 0;
  els.revealedPanel.style.display = hasAnyRevealed ? 'block' : 'none';

  // Image hint
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

  // Disable hint buttons if guessed
  if (state.guessed) {
    els.revealImage.disabled = true;
    els.revealSeason.disabled = true;
    els.revealEpisode.disabled = true;
  }
}

// === AUTOCOMPLETE ===
function getFilteredEpisodes() {
  const range = getSeasonRange();
  return episodes.filter(ep => ep.season >= range.min && ep.season <= range.max);
}

function setupAutocomplete() {
  let selectedIndex = -1;

  els.guessInput.addEventListener('input', () => {
    const value = els.guessInput.value.toLowerCase().trim();

    if (value.length < 1) {
      els.autocompleteList.classList.remove('active');
      return;
    }

    const filteredEpisodes = getFilteredEpisodes();
    const matches = filteredEpisodes
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
    const li = e.target.closest('li');
    if (li) {
      els.guessInput.value = li.dataset.title;
      els.autocompleteList.classList.remove('active');
    }
  });

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
  els.nextRound.addEventListener('click', startNewRound);

  setupAutocomplete();

  // Start game
  await startNewRound();
}

init();
