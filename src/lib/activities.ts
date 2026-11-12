// Party games and challenges for the Games tab. Shared by the server (dealing cards) and the page (showing them).
// Every game has a "soft" mode where drinks become sips of water or forfeits, so nobody has to drink to play.

export type GameId = 'never' | 'likely' | 'rather' | 'truth' | 'categories' | 'challenges';

export type Game = {
	id: GameId;
	name: string;
	emoji: string;
	blurb: string;
	/** How to play, with drinking. */
	rules: string;
	/** How to play in soft mode. */
	softRules: string;
	cards: string[];
	/** Points for completing each card; only challenges score. */
	points?: number[];
};

const NEVER = [
	'Never have I ever fallen asleep at a party.',
	'Never have I ever pretended to know a song I’d never heard.',
	'Never have I ever sent a text to the wrong person.',
	'Never have I ever lost my phone on a night out.',
	'Never have I ever got lost on the way home.',
	'Never have I ever eaten a kebab before midnight.',
	'Never have I ever missed the last train.',
	'Never have I ever cried at a film in the cinema.',
	'Never have I ever been kicked out of a pub.',
	'Never have I ever lied about my age.',
	'Never have I ever ghosted someone.',
	'Never have I ever stalked an ex on social media.',
	'Never have I ever slept through an alarm for something important.',
	'Never have I ever done karaoke sober.',
	'Never have I ever forgotten someone’s name straight after meeting them.',
	'Never have I ever broken something at a gaff and not owned up.',
	'Never have I ever been on a dating app.',
	'Never have I ever walked into a glass door.',
	'Never have I ever said “I love you” first.',
	'Never have I ever taken a selfie at a funeral or wedding I didn’t want to be at.',
	'Never have I ever pretended to be ill to skip plans.',
	'Never have I ever laughed so hard I cried in public.',
	'Never have I ever been to a festival.',
	'Never have I ever had a crush on a friend’s sibling.',
	'Never have I ever fallen over on a dance floor.',
	'Never have I ever burnt toast.',
	'Never have I ever got a tattoo I regret.',
	'Never have I ever been on TV.',
	'Never have I ever woken up still wearing my shoes.',
	'Never have I ever sung in the shower loud enough for the neighbours.'
];

const LIKELY = [
	'Who’s most likely to become famous?',
	'Who’s most likely to miss the last train tonight?',
	'Who’s most likely to start a fight with a bouncer?',
	'Who’s most likely to cry first tonight?',
	'Who’s most likely to end up on the news?',
	'Who’s most likely to text their ex tonight?',
	'Who’s most likely to be first on the dance floor?',
	'Who’s most likely to get married first?',
	'Who’s most likely to fall asleep before midnight?',
	'Who’s most likely to lose their keys?',
	'Who’s most likely to survive a zombie apocalypse?',
	'Who’s most likely to order a kebab on the way home?',
	'Who’s most likely to become a millionaire?',
	'Who’s most likely to adopt five cats?',
	'Who’s most likely to talk their way out of trouble?',
	'Who’s most likely to forget it’s their own birthday?',
	'Who’s most likely to go viral?',
	'Who’s most likely to move abroad on a whim?',
	'Who’s most likely to befriend a stranger in the smoking area?',
	'Who’s most likely to still be up at 6am?',
	'Who’s most likely to book a holiday when drunk?',
	'Who’s most likely to win a pub quiz on their own?',
	'Who’s most likely to accidentally like an old photo?',
	'Who’s most likely to host the next gaff?',
	'Who’s most likely to be late to their own wedding?'
];

const RATHER = [
	'Would you rather only drink warm drinks or only cold drinks forever?',
	'Would you rather always be 10 minutes late or always 20 minutes early?',
	'Would you rather give up music or give up films?',
	'Would you rather have a rewind button or a pause button for life?',
	'Would you rather be the funniest or the smartest person in the room?',
	'Would you rather live without the internet or without a fridge?',
	'Would you rather only eat pizza or only eat curry for a year?',
	'Would you rather fight one horse-sized duck or a hundred duck-sized horses?',
	'Would you rather know when you’ll die or how you’ll die?',
	'Would you rather have your search history or your texts read out?',
	'Would you rather never have a hangover again or never need sleep?',
	'Would you rather be able to fly or be invisible?',
	'Would you rather sing everything you say or dance everywhere you walk?',
	'Would you rather lose your phone or your wallet tonight?',
	'Would you rather live in a castle or a spaceship?',
	'Would you rather be stuck in a lift with your boss or your ex?',
	'Would you rather have free taxis for life or free takeaways for life?',
	'Would you rather go back in time or into the future?',
	'Would you rather always have to whisper or always have to shout?',
	'Would you rather host every party or never host one again?',
	'Would you rather be famous on TikTok or rich and unknown?',
	'Would you rather have a personal chef or a personal driver?',
	'Would you rather speak every language or play every instrument?',
	'Would you rather give up chocolate or cheese?'
];

const TRUTH = [
	'Truth: What’s the most embarrassing thing on your phone right now?',
	'Dare: Do your best impression of someone in the room until someone guesses who.',
	'Truth: Who in this room would you call at 3am in an emergency?',
	'Dare: Let the group choose your next profile picture for 24 hours.',
	'Truth: What’s the worst date you’ve been on?',
	'Dare: Speak in an accent of the group’s choice for the next three rounds.',
	'Truth: What’s something you’ve never told anyone here?',
	'Dare: Show the group the last photo you took.',
	'Truth: What’s your most irrational fear?',
	'Dare: Do 10 star jumps while singing the national anthem.',
	'Truth: What’s the biggest lie you’ve ever told your parents?',
	'Dare: Let someone send one (kind!) message from your phone to the group chat.',
	'Truth: Who was your first celebrity crush?',
	'Dare: Talk without using the letter S until your next turn.',
	'Truth: What’s the pettiest thing you’ve ever done?',
	'Dare: Give everyone in the room a genuine compliment.',
	'Truth: What’s the most money you’ve wasted on a night out?',
	'Dare: Do a dramatic reading of the last text you sent.',
	'Truth: What’s your guilty-pleasure song?',
	'Dare: Hold a plank until your next turn comes round (or as long as you can).',
	'Truth: Have you ever had a crush on someone here?',
	'Dare: Let the group give you a new nickname for the rest of the night.'
];

const CATEGORIES = [
	'Name a type of cheese.',
	'Name a London Underground station.',
	'Name a Premier League club.',
	'Name a cocktail.',
	'Name a crisp flavour.',
	'Name a Disney film.',
	'Name a capital city.',
	'Name a brand of beer.',
	'Name a Spice Girls or One Direction song.',
	'Name a chocolate bar.',
	'Name a British seaside town.',
	'Name a reality TV show.',
	'Name a dog breed.',
	'Name something you’d find in a kebab shop.',
	'Name a James Bond actor or film.',
	'Name a fruit.',
	'Name a pub chain or famous pub.',
	'Name a board game.',
	'Name a superhero.',
	'Name a Christmas song.'
];

const CHALLENGES: [string, number][] = [
	['Get the whole room to sing a chorus together.', 3],
	['Do your best runway walk across the room.', 1],
	['Tell a joke. If nobody laughs, it doesn’t count.', 2],
	['Swap an item of clothing with the person to your left until your next turn.', 2],
	['Balance a coaster on your head for one minute.', 1],
	['Get three people to high-five you without asking them to.', 3],
	['Name 10 countries in 20 seconds.', 2],
	['Do an impression the room has to guess within 30 seconds.', 2],
	['Recite the alphabet backwards in under 30 seconds.', 3],
	['Make up a toast for the host and deliver it.', 1],
	['Hold a conversation only in questions for two minutes.', 2],
	['Beat someone of your choice at rock, paper, scissors (best of three).', 1],
	['Get a stranger or the bar staff to tell you their favourite song (be polite!).', 3],
	['Drink a full glass of water, no stopping.', 1],
	['Do a 30-second stand-up set about tonight so far.', 3],
	['Teach the room a dance move. Everyone has to copy it.', 2],
	['Guess the time without looking. Within five minutes counts.', 1],
	['Draw a portrait of someone on a napkin. They have to keep it.', 1],
	['Keep a straight face for 30 seconds while the group tries to make you laugh.', 2],
	['Say the name of everyone here backwards.', 2],
	['Do 15 squats while everyone counts.', 1],
	['Get someone to say “gaff” without saying it yourself.', 2],
	['Pick a song for the next track and justify it in 10 seconds.', 1],
	['Tell the story of how you met someone here in exactly three sentences.', 2]
];

export const GAMES: Record<GameId, Game> = {
	never: {
		id: 'never',
		name: 'Never have I ever',
		emoji: '🙊',
		blurb: 'Read the card. Anyone who has done it owns up.',
		rules: 'If you’ve done it, take a sip.',
		softRules: 'If you’ve done it, put a finger down. Three fingers down and you take a forfeit.',
		cards: NEVER
	},
	likely: {
		id: 'likely',
		name: 'Most likely to',
		emoji: '👉',
		blurb: 'On three, everyone points at who fits the card best.',
		rules: 'Whoever gets the most fingers pointed at them takes a sip for each one.',
		softRules: 'Whoever gets the most votes has to explain themselves in 20 seconds.',
		cards: LIKELY
	},
	rather: {
		id: 'rather',
		name: 'Would you rather',
		emoji: '⚖️',
		blurb: 'Everyone picks a side. No sitting on the fence.',
		rules: 'Whoever’s on the smaller side takes a sip.',
		softRules: 'The smaller side has to convince one person to switch.',
		cards: RATHER
	},
	truth: {
		id: 'truth',
		name: 'Truth or dare',
		emoji: '🎭',
		blurb: 'Take turns going round the room. You get whatever card comes up.',
		rules: 'Don’t want to answer or do it? Take two sips and pass.',
		softRules: 'Don’t want to answer or do it? Pass, and the group picks a forfeit.',
		cards: TRUTH
	},
	categories: {
		id: 'categories',
		name: 'Categories',
		emoji: '🗂️',
		blurb: 'Go round the room naming things in the category. No repeats, no long pauses.',
		rules: 'Whoever freezes, repeats or gets it wrong takes a sip.',
		softRules: 'Whoever freezes, repeats or gets it wrong is out. Last one standing wins.',
		cards: CATEGORIES
	},
	challenges: {
		id: 'challenges',
		name: 'Challenges',
		emoji: '🏆',
		blurb: 'The app picks someone and gives them a challenge. Complete it for points.',
		rules: 'Complete it for the points, or bail and take a sip. Top scorer at the end of the night wins.',
		softRules: 'Complete it for the points, or bail with no points. Top scorer at the end of the night wins.',
		cards: CHALLENGES.map(([text]) => text),
		points: CHALLENGES.map(([, points]) => points)
	}
};

export const GAME_IDS = Object.keys(GAMES) as GameId[];

export const isGameId = (value: string): value is GameId => value in GAMES;
