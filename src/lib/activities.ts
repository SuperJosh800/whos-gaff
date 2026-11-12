// Drinking games for the Games tab, grouped by where you are: the pub, the club or the gaff.
// Shared by the server (dealing cards) and the page (showing them).
//
// Cards can name people: {1}, {2} and {3} are swapped for different random players when the card is dealt,
// so "{1} buys {2} a drink" becomes "Sam buys Jo a drink".
// Every game has a soft mode where drinks become sips of water or soft drinks, so nobody has to drink to play.

export type Setting = 'pub' | 'club' | 'gaff' | 'any';

export const SETTINGS: Record<Setting, { label: string; emoji: string; blurb: string }> = {
	pub: { label: 'Pub', emoji: '🍺', blurb: 'Rounds, roulette and who’s buying next.' },
	club: { label: 'Club', emoji: '🪩', blurb: 'Shots and dance-floor dares. Quick ones between songs.' },
	gaff: { label: 'Gaff', emoji: '🏠', blurb: 'Pres and house parties: round the table, and the whole table can pay for it.' },
	any: { label: 'Anywhere', emoji: '🎲', blurb: 'Work wherever you are.' }
};
export const SETTING_IDS = Object.keys(SETTINGS) as Setting[];
export const isSetting = (value: string): value is Setting => value in SETTINGS;

/**
 * A card. A secret card is only shown to the first person it names ({1}); everyone else sees
 * `cover`, an easy fake task they can do openly so nobody suspects the real one.
 */
export type Card = { text: string; points?: number; secret?: boolean; cover?: string };

export const DEFAULT_COVER = '{1}: take a sip of your drink.';

export type Game = {
	id: string;
	name: string;
	emoji: string;
	setting: Setting;
	blurb: string;
	/** How to play. */
	rules: string;
	/** How to play in soft mode; defaults to SOFT_NOTE. */
	softRules?: string;
	/** Challenges: the first person named on each card can complete it for points or bail. */
	scored?: boolean;
	cards: Card[];
};

export const SOFT_NOTE = 'Soft mode: every sip, drink or shot becomes a sip of water or a soft drink.';

const deck = (texts: string[]): Card[] => texts.map((text) => ({ text }));

// ---- Pub ----

const PUB_ROULETTE = deck([
	'{1}, finish your drink.',
	'{1} buys {2} a drink at the next round.',
	'{1} and {2}: whoever has more left in their glass finishes it.',
	'Last person to touch the table takes a sip.',
	'{1} picks someone to drink with them.',
	'Waterfall! {1} starts, everyone follows, and nobody stops until the person before them does.',
	'{1} has to go to the bar and order using only a posh accent.',
	'Everyone with less than half a drink left finishes it.',
	'{1} is the next round’s buyer. No arguments.',
	'{1} gives out three sips however they like.',
	'Cheers! Everyone takes a sip and says one nice thing about {1}.',
	'{1} and {2} swap drinks for one sip.',
	'Whoever’s phone is on the lowest battery takes two sips.',
	'{1} tells an embarrassing story or finishes their drink.',
	'Thumb war: {1} vs {2}. Loser takes two sips.',
	'Whoever arrived last tonight takes a sip.',
	'{1} has to get a beer mat signed by someone at the bar.',
	'Everyone drinking the same thing as {1} takes a sip.',
	'{1} makes a toast. Everyone drinks to it.',
	'Rock, paper, scissors: {1} vs {2}. Loser buys the crisps.',
	'Left hands only until your next drink. Get caught using your right and take a sip. {1} is the referee.',
	'{1}, guess what {2} is drinking without looking. Wrong? Take a sip.',
	'Whoever went to the bar last takes a sip for their trouble.',
	'{1} picks the next pub, or the next song on the jukebox.'
]);

const PUB_QUIZ = deck([
	'{1}: name the capital of Australia. Wrong? Drink.',
	'{1}: how many pints in a gallon? (8) Wrong? Drink.',
	'{1}: who won the last men’s World Cup? Wrong? Drink.',
	'{1} vs {2}: first to name five crisp flavours. Loser drinks.',
	'{1}: spell “necessary” out loud. Wrong? Drink.',
	'{1}: what’s 17 × 3? You’ve got five seconds.',
	'{1}: name all four Beatles. One sip per one you miss.',
	'{1} vs {2}: first to name three Bond actors. Loser drinks.',
	'{1}: what year did the UK leave the EU? (2020) Wrong? Drink.',
	'Everyone: point to north. Whoever’s furthest off drinks. {1} checks the compass.',
	'{1}: name a country beginning with Z. Can’t? Drink.',
	'{1}: how many players in a rugby union team? (15) Wrong? Drink.',
	'{1} vs {2}: hum a song; first to guess the other’s wins. Loser drinks.',
	'{1}: what does “www” stand for? Wrong? Drink.',
	'{1}: name the planets in order. One sip per mistake.',
	'{1}: who sang “Wonderwall”? Wrong? Two sips.',
	'{1}: what’s the chemical symbol for gold? (Au) Wrong? Drink.',
	'{1}: name five London boroughs in ten seconds. Fail? Drink.',
	'{1} asks {2} any trivia question. Wrong answer, {2} drinks. Right answer, {1} drinks.',
	'Everyone: guess the bill for the last round. Furthest off drinks.'
]);

// ---- Club ----

const SHOT_OCLOCK = deck([
	'Everyone takes a shot. Cheers!',
	'{1} picks someone to take a shot with.',
	'Shot race: {1} vs {2}. Last one done buys the next one.',
	'{1} takes a shot or does a 30-second solo on the dance floor.',
	'Next throwback the DJ plays, everyone takes a shot.',
	'{1} has to find the group a spot at the bar. Fail and it’s your shot.',
	'Whoever’s been to the toilets most tonight takes a shot.',
	'{1} and {2} do a dance-off. The group picks the loser, and the loser takes a shot.',
	'{1} chooses the next round of shots for everyone.',
	'Next time someone sings along, they take a shot. {1} is watching.',
	'{1}, get the DJ to play a request. Fail and take a shot.',
	'Everyone wearing black takes a shot.',
	'Lost the group? Whoever gets lost next takes a shot. {1} keeps count.',
	'{1} takes a shot with whoever they’ve known longest here.',
	'Group photo! Whoever blinks or isn’t ready takes a shot.',
	'{1} buys {2} a shot. {2} buys the next one.',
	'Every time the bass drops in the next song, {1} takes a sip.',
	'Whoever has the most phone battery holds the group’s stuff, and takes a shot as payment.',
	'Water round! Everyone has a glass of water. {1} makes sure.',
	'{1} and {2}: matching shots, arms linked.'
]);

const DANCE_DARES = deck([
	'{1} starts a conga line. Two sips if nobody joins.',
	'{1} has to dance with {2} for a whole song.',
	'{1}: do your signature move. The group rates it. Under 5 means a sip.',
	'Everyone copies {1}’s moves for the next chorus. Whoever stops first drinks.',
	'{1} has to get a stranger to do a move with them (be nice about it).',
	'{1} and {2} lip-sync the next song. Best one makes the other drink.',
	'{1} dances like nobody’s watching for 30 seconds. Refuse? Take a shot.',
	'Freeze! Next time the music cuts, last to freeze drinks.',
	'{1} leads the group in the worst dance they know.',
	'{1} has to do the robot whenever the DJ says anything, until you leave.',
	'Dance circle! {1} goes in the middle first.',
	'{1} picks a move; everyone does it on the next drop. Miss it and take a sip.',
	'{1}: invent a dance for the group’s anthem. Everyone has to learn it.',
	'Shoulders only! Everyone dances using only their shoulders. First to break drinks.',
	'{1} has to slow-dance to a fast song with {2}.'
]);

// ---- Gaff ----

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS: [string, string][] = [
	['A', 'Waterfall: everyone starts drinking; nobody stops until the person before them does.'],
	['2', 'You: pick someone to drink.'],
	['3', 'Me: you drink.'],
	['4', 'Floor: last to touch the floor drinks.'],
	['5', 'Thumb master: put your thumb on the table any time you like; last to copy you drinks. Lasts until the next 5.'],
	['6', 'Heaven: last to point up drinks.'],
	['7', 'Mate: pick a drinking buddy. Whenever you drink, they drink too.'],
	['8', 'Rhyme: say a word; go round rhyming with it. Whoever can’t, drinks.'],
	['9', 'Categories: pick a category and go round naming things in it. Whoever can’t, drinks.'],
	['10', 'Never have I ever: one round. Put a finger down if you have; first with three down drinks.'],
	['J', 'Make a rule that lasts the whole game, like “no first names”. Break it, drink.'],
	['Q', 'Question master: anyone who answers a question you ask drinks. Lasts until the next queen.'],
	['K', 'King’s cup: pour a splash of your drink into the cup in the middle. Whoever draws the fourth king drinks it.']
];
const RING_OF_FIRE: Card[] = SUITS.flatMap((suit) =>
	RANKS.map(([rank, rule]) => ({ text: `${rank}${suit}: ${rule}` }))
);

const TABLE_STAKES = deck([
	'{1} has 10 seconds to name 5 cheeses. Fail, and the whole table takes a shot.',
	'{1} flips a bottle cap into a cup in three tries. Miss, and the whole table drinks.',
	'{1} and {2} go head to head: first to name 6 football clubs. The loser’s side of the table drinks.',
	'{1}: balance a coin on its edge. Pull it off and everyone else drinks. Fail and you drink.',
	'{1} tells a joke. If nobody laughs, the whole table drinks. If everyone laughs, {1} gives out five sips.',
	'Everyone has to guess {1}’s middle name. Everyone who gets it wrong drinks.',
	'{1} recites the alphabet backwards. One mistake and the whole table takes a shot.',
	'{1} picks a song; the table sings the chorus together. Anyone who doesn’t know it drinks.',
	'{1} vs the table: {1} names a country, the table names one from the same continent. First side to run out drinks.',
	'{1} has to land a ping-pong ball in a cup. Land it: everyone else drinks. Miss: {1} does.',
	'{1} catches a coaster flipped off the edge of the table. Drop it: whole table drinks.',
	'Silent round: nobody speaks until {1}’s next turn. First to talk makes the whole table drink with them.',
	'{1} and {2} have a staring contest. The loser drinks, and if anyone laughs they all drink.',
	'{1} has to make {2} laugh in 30 seconds. Succeed and the table drinks; fail and {1} does.',
	'Flip cup! {1}’s half of the table vs {2}’s half. The losing side finishes their cups.',
	'{1} gets three guesses at {2}’s favourite film. All wrong? The whole table takes a shot.',
	'Everyone points at who’ll be first to go home. Most fingers drinks once per finger.',
	'{1} names a rule for the table that lasts three rounds. Break it, drink.',
	'Quickfire: {1} starts counting, everyone says the next number, but say “gaff” instead of every multiple of 3. Whoever slips: the whole table drinks.',
	'{1} hums a theme tune. If nobody guesses it in 20 seconds, the whole table drinks.',
	'Waterfall, led by {1}.',
	'{1} gets to make the whole table drink, or skip it and pick one person to finish their drink.'
]);

const NEVER = deck([
	'Never have I ever fallen asleep at a party.',
	'Never have I ever pretended to know a song I’d never heard.',
	'Never have I ever sent a text to the wrong person.',
	'Never have I ever lost my phone on a night out.',
	'Never have I ever got lost on the way home.',
	'Never have I ever missed the last train.',
	'Never have I ever been kicked out of a pub.',
	'Never have I ever lied about my age.',
	'Never have I ever ghosted someone.',
	'Never have I ever stalked an ex on social media.',
	'Never have I ever done karaoke sober.',
	'Never have I ever forgotten someone’s name straight after meeting them.',
	'Never have I ever broken something at a gaff and not owned up.',
	'Never have I ever been on a dating app.',
	'Never have I ever said “I love you” first.',
	'Never have I ever pretended to be ill to skip plans.',
	'Never have I ever fallen over on a dance floor.',
	'Never have I ever woken up still wearing my shoes.',
	'Never have I ever drunk-texted someone I shouldn’t have.',
	'Never have I ever ordered a takeaway I don’t remember ordering.',
	'Never have I ever been sick in a taxi.',
	'Never have I ever lost my shoes on a night out.',
	'Never have I ever tried to get into a club with a fake ID.',
	'Never have I ever slept on a friend’s bathroom floor.',
	'Never have I ever cried on a night out.',
	'Never have I ever woken up somewhere and not known how I got there.'
]);

const TRUTH = deck([
	'Truth: What’s the most embarrassing thing on your phone right now?',
	'Dare: Do your best impression of someone in the room until someone guesses who.',
	'Truth: What’s the worst thing you’ve done on a night out?',
	'Dare: Let the group choose your next profile picture for 24 hours.',
	'Truth: What’s the worst date you’ve been on?',
	'Dare: Speak in an accent of the group’s choice for the next three rounds.',
	'Truth: Who here would you least want to be stuck on a desert island with?',
	'Dare: Show the group the last photo you took.',
	'Truth: What’s the biggest lie you’ve ever told your parents?',
	'Dare: Let someone send one (kind!) message from your phone to the group chat.',
	'Truth: Who was your first celebrity crush?',
	'Dare: Mix a drink for the person to your left from whatever’s on the table.',
	'Truth: What’s the pettiest thing you’ve ever done?',
	'Dare: Take a shot with no hands.',
	'Truth: What’s the most money you’ve wasted on a night out?',
	'Dare: Do a dramatic reading of the last text you sent.',
	'Truth: Have you ever had a crush on someone here?',
	'Dare: Let the group give you a nickname for the rest of the night.',
	'Truth: What’s the drunkest you’ve ever been?',
	'Dare: Text your mum “I’ve got something to tell you” and wait two minutes before following up.'
]);

const LIKELY = deck([
	'Who’s most likely to miss the last train tonight?',
	'Who’s most likely to start a fight with a bouncer?',
	'Who’s most likely to cry first tonight?',
	'Who’s most likely to text their ex tonight?',
	'Who’s most likely to be first on the dance floor?',
	'Who’s most likely to fall asleep before midnight?',
	'Who’s most likely to lose their keys?',
	'Who’s most likely to order a kebab on the way home?',
	'Who’s most likely to befriend a stranger in the smoking area?',
	'Who’s most likely to still be up at 6am?',
	'Who’s most likely to book a holiday when drunk?',
	'Who’s most likely to accidentally like an old photo?',
	'Who’s most likely to host the next gaff?',
	'Who’s most likely to get us kicked out?',
	'Who’s most likely to disappear without saying bye?',
	'Who’s most likely to end up in a different club from everyone else?',
	'Who’s most likely to start the shots?',
	'Who’s most likely to be hungover the longest tomorrow?',
	'Who’s most likely to lose a shoe tonight?',
	'Who’s most likely to cry at the kebab shop?'
]);

const RATHER = deck([
	'Would you rather only drink shots or only drink pints for the rest of the night?',
	'Would you rather never have a hangover again or never need sleep?',
	'Would you rather lose your phone or your wallet tonight?',
	'Would you rather have free taxis for life or free takeaways for life?',
	'Would you rather be stuck in a lift with your boss or your ex?',
	'Would you rather host every party or never host one again?',
	'Would you rather drink warm beer or flat lemonade forever?',
	'Would you rather fight one horse-sized duck or a hundred duck-sized horses?',
	'Would you rather have your search history or your texts read out?',
	'Would you rather give up chocolate or cheese?',
	'Would you rather sing everything you say or dance everywhere you walk?',
	'Would you rather always be 10 minutes late or always 20 minutes early?',
	'Would you rather only drink wine or only drink cider?',
	'Would you rather be the drunkest or the most sober person on every night out?',
	'Would you rather be famous on TikTok or rich and unknown?',
	'Would you rather have the night of your life and forget it, or a boring night you remember?',
	'Would you rather a free bar all night or a free taxi home?',
	'Would you rather your mum or your boss see your camera roll from tonight?'
]);

const CATEGORIES = deck([
	'Name a type of cheese.',
	'Name a London Underground station.',
	'Name a Premier League club.',
	'Name a cocktail.',
	'Name a crisp flavour.',
	'Name a brand of beer.',
	'Name a spirit.',
	'Name a chocolate bar.',
	'Name a British seaside town.',
	'Name a reality TV show.',
	'Name something you’d find in a kebab shop.',
	'Name a pub chain or famous pub.',
	'Name a drinking game.',
	'Name a song with a drink in the title.',
	'Name a capital city.',
	'Name a superhero.'
]);

const CHALLENGES: Card[] = [
	{ text: '{1}: get the whole room to sing a chorus together.', points: 3 },
	{ text: '{1}: tell a joke. If nobody laughs, it doesn’t count.', points: 2 },
	{ text: '{1}: swap an item of clothing with {2} until your next turn.', points: 2 },
	{ text: '{1}: balance a coaster on your head for one minute.', points: 1 },
	{ text: '{1}: get three people to high-five you without asking them to.', points: 3 },
	{ text: '{1}: name 10 countries in 20 seconds.', points: 2 },
	{ text: '{1}: recite the alphabet backwards in under 30 seconds.', points: 3 },
	{ text: '{1}: make up a toast for the host and deliver it.', points: 1 },
	{ text: '{1}: beat {2} at rock, paper, scissors (best of three).', points: 1 },
	{ text: '{1}: finish your drink in one go.', points: 2 },
	{ text: '{1}: drink a full glass of water, no stopping.', points: 1 },
	{ text: '{1}: do a 30-second stand-up set about tonight so far.', points: 3 },
	{ text: '{1}: teach the room a dance move. Everyone has to copy it.', points: 2 },
	{ text: '{1}: keep a straight face for 30 seconds while the group tries to make you laugh.', points: 2 },
	{ text: '{1}: get {2} to say “gaff” without saying it yourself.', points: 2 },
	{ text: '{1}: take a shot with no hands.', points: 2 },
	{ text: '{1}: buy {2} a drink.', points: 3 },
	{ text: '{1}: tell the story of how you met {2} in exactly three sentences.', points: 2 }
];

/**
 * Secret missions for the Night tab. Everyone who opts in gets one, private to them, to pull off any time
 * before the night ends; {2} is someone else on the night. Photo missions need a photo as proof.
 */
export type Mission = { text: string; points: number; photo?: boolean };

export const MISSIONS: Mission[] = [
	{ text: 'Get {2} to say “banana” without them realising it’s a dare.', points: 3 },
	{ text: 'Work the word “pineapple” into conversation three times.', points: 2 },
	{ text: 'Get three people to clink glasses with you within 10 minutes.', points: 2 },
	{ text: 'Swap seats with {2} without anyone noticing.', points: 3 },
	{ text: 'Get someone to give you a high five without asking.', points: 1 },
	{ text: 'Convince {2} you’ve been to a country you’ve never visited.', points: 3 },
	{ text: 'Get the whole group to cheers without directly suggesting it.', points: 3 },
	{ text: 'Get {2} to tell you the time twice, at least an hour apart.', points: 2 },
	{ text: 'Get {2} to sing a line of any song.', points: 3 },
	{ text: 'Mention a made-up celebrity and get someone to say they’ve heard of them.', points: 3 },
	{ text: 'Say “to be fair” at the start of five sentences in a row.', points: 2 },
	{ text: 'Get someone to offer to buy you a drink.', points: 3 },
	{ text: 'Get the group talking about pigeons for at least a minute.', points: 3 },
	{ text: 'Get {2} to stand up without asking them to.', points: 2 },
	{ text: 'Get a photo of {2} doing a thumbs up without telling them why.', points: 2, photo: true },
	{ text: 'Get a photo of the whole group pulling the same face.', points: 3, photo: true },
	{ text: 'Get a photo with a stranger who agrees to pose with you.', points: 3, photo: true },
	{ text: 'Get a photo of {2} holding two drinks at once.', points: 2, photo: true },
	{ text: 'Get a group selfie where nobody realises you set it up for a mission.', points: 2, photo: true },
	{ text: 'Get a photo of {2} wearing something that isn’t theirs.', points: 3, photo: true },
	{ text: 'Get a photo of the bar staff smiling at the camera.', points: 3, photo: true },
	{ text: 'Get a photo of {2} mid-dance.', points: 2, photo: true }
];

const GAME_LIST: Game[] = [
	{
		id: 'pub-roulette',
		name: 'Pub roulette',
		emoji: '🎰',
		setting: 'pub',
		blurb: 'The app picks people at random: finish your drink, buy someone a round, swap drinks.',
		rules: 'Do what the card says. Refuse and take two sips.',
		cards: PUB_ROULETTE
	},
	{
		id: 'pub-quiz',
		name: 'Pub quiz forfeits',
		emoji: '🧠',
		setting: 'pub',
		blurb: 'Quickfire questions for whoever the app picks. Wrong answers drink.',
		rules: 'Read the question out. Wrong answer, drink. Whoever reads it is quizmaster.',
		cards: PUB_QUIZ
	},
	{
		id: 'shot-oclock',
		name: 'Shot o’clock',
		emoji: '🥃',
		setting: 'club',
		blurb: 'Quick shot dares between songs. Pull a card at the bar.',
		rules: 'Do what the card says. Refuse and you buy the next shot.',
		softRules: 'Shots become shots of water or a soft drink. Refuse and you pick the next song request.',
		cards: SHOT_OCLOCK
	},
	{
		id: 'dance-dares',
		name: 'Dance-floor dares',
		emoji: '🕺',
		setting: 'club',
		blurb: 'Dares for the dance floor. Bail and you drink.',
		rules: 'Do the dare. Bail and take a shot.',
		softRules: 'Do the dare. Bail and buy a round of soft drinks.',
		cards: DANCE_DARES
	},
	{
		id: 'ring-of-fire',
		name: 'Ring of fire',
		emoji: '🔥',
		setting: 'gaff',
		blurb: 'The classic card game: each card has a rule, and the fourth king drinks the cup.',
		rules: 'Take turns drawing. Do what the card says. Put a cup in the middle for the kings.',
		cards: RING_OF_FIRE
	},
	{
		id: 'table-stakes',
		name: 'Table stakes',
		emoji: '🎯',
		setting: 'gaff',
		blurb: 'One person takes on a challenge, and if they fail, the whole table takes a shot.',
		rules: 'Do what the card says. When the card says the whole table drinks, everyone drinks, no exceptions.',
		cards: TABLE_STAKES
	},
	{
		id: 'never',
		name: 'Never have I ever',
		emoji: '🙊',
		setting: 'gaff',
		blurb: 'Read the card. Anyone who has done it drinks.',
		rules: 'If you’ve done it, take a sip.',
		softRules: 'If you’ve done it, put a finger down. Three fingers down and you take a forfeit.',
		cards: NEVER
	},
	{
		id: 'truth',
		name: 'Truth or dare',
		emoji: '🎭',
		setting: 'gaff',
		blurb: 'Take turns going round the room. You get whatever card comes up.',
		rules: 'Don’t want to answer or do it? Take two sips and pass.',
		softRules: 'Don’t want to answer or do it? Pass, and the group picks a forfeit.',
		cards: TRUTH
	},
	{
		id: 'likely',
		name: 'Most likely to',
		emoji: '👉',
		setting: 'any',
		blurb: 'On three, everyone points at who fits the card best.',
		rules: 'Whoever gets the most fingers pointed at them takes a sip for each one.',
		softRules: 'Whoever gets the most votes has to explain themselves in 20 seconds.',
		cards: LIKELY
	},
	{
		id: 'rather',
		name: 'Would you rather',
		emoji: '⚖️',
		setting: 'any',
		blurb: 'Everyone picks a side. No sitting on the fence.',
		rules: 'Whoever’s on the smaller side takes a sip.',
		softRules: 'The smaller side has to convince one person to switch.',
		cards: RATHER
	},
	{
		id: 'categories',
		name: 'Categories',
		emoji: '🗂️',
		setting: 'any',
		blurb: 'Go round naming things in the category. No repeats, no long pauses.',
		rules: 'Whoever freezes, repeats or gets it wrong takes a sip.',
		softRules: 'Whoever freezes, repeats or gets it wrong is out. Last one standing wins.',
		cards: CATEGORIES
	},
	{
		id: 'challenges',
		name: 'Challenges',
		emoji: '🏆',
		setting: 'any',
		blurb: 'The app picks someone and gives them a challenge. Complete it for points.',
		rules: 'Complete it for the points, or bail and take a sip. Top scorer at the end of the night wins.',
		softRules: 'Complete it for the points, or bail with no points. Top scorer at the end of the night wins.',
		scored: true,
		cards: CHALLENGES
	}
];

export const GAMES: Record<string, Game> = Object.fromEntries(GAME_LIST.map((g) => [g.id, g]));
export const GAME_IDS = GAME_LIST.map((g) => g.id);

/** How many different people a card names: the highest {n} in it. */
export function namesNeeded(text: string) {
	let most = 0;
	for (const match of text.matchAll(/\{([1-3])\}/g)) most = Math.max(most, Number(match[1]));
	return most;
}

/** Puts names into a card's {1}, {2} and {3}; a name that's missing reads as "someone". */
export function fillNames(text: string, names: string[]) {
	return text.replace(/\{([1-3])\}/g, (_, n) => names[Number(n) - 1] ?? 'someone');
}

// Limits for games people make themselves.
export const CUSTOM = { name: 60, rules: 300, card: 200, maxCards: 150, maxGames: 50 } as const;
