// ---------------------------------------------------------------------------
// Deck predefiniti, espressi per nome inglese delle carte (i nomi sono stabili,
// gli id cambiano tra le ristampe). Vengono risolti tramite l'API al primo avvio.
// ---------------------------------------------------------------------------

export interface NamedDeck {
  id: string;
  name: string;
  description: string;
  main: string[];
  extra: string[];
  /** Carta simbolo mostrata nella tessera del menu. */
  cover: string;
  /** Colore d'accento della tessera. */
  accent: string;
  /** Sezione nella selezione dei deck. */
  section: DeckSection;
}

export type DeckSection = 'base' | 'dm' | 'gx';

export const DECK_SECTIONS: { key: DeckSection; title: string; subtitle: string }[] = [
  { key: 'dm', title: 'Yu-Gi-Oh! Duel Monsters', subtitle: 'I duellanti della prima serie' },
  { key: 'gx', title: 'Yu-Gi-Oh! GX', subtitle: 'Duel Academy e i suoi rivali' },
  { key: 'base', title: 'Deck di base', subtitle: 'Archetipi generici, ben bilanciati per imparare' },
];

const x = (name: string, n: number) => Array<string>(n).fill(name);

export const STARTER_DECKS: NamedDeck[] = [
  {
    id: 'yugi',
    section: 'dm',
    name: 'Yugi Muto',
    cover: 'Dark Magician',
    accent: '#7b5cf0',
    description: 'Mago Nero, Mago Nero Fanciulla, Kuriboh e le magie del Faraone.',
    main: [...x('Dark Magician', 3), ...x('Dark Magician Girl', 2), ...x('Kuriboh', 2), 'Summoned Skull', 'Buster Blader', 'Gaia The Fierce Knight', 'Celtic Guardian', 'Beta The Magnet Warrior', 'Alpha The Magnet Warrior', 'Gamma the Magnet Warrior', 'Big Shield Gardna', 'Queen\'s Knight', 'King\'s Knight', 'Jack\'s Knight', 'Skilled Dark Magician', 'Magician of Faith', 'Dark Magic Attack', 'Thousand Knives', 'Magical Dimension', 'Sage\'s Stone', 'Dark Magic Curtain', 'Monster Reborn', 'Pot of Greed', 'Graceful Charity', 'Swords of Revealing Light', 'Polymerization', 'Mystical Space Typhoon', 'Brain Control', 'Book of Secret Arts', 'Magic Formula', 'Mirror Force', 'Magic Cylinder', 'Spellbinding Circle', 'Magical Hats', 'Book of Moon', 'Trap Hole'],
    extra: ['Dark Paladin', 'Gaia the Dragon Champion'],
  },
  {
    id: 'kaiba',
    section: 'dm',
    name: 'Seto Kaiba',
    cover: 'Blue-Eyes White Dragon',
    accent: '#4f8fd6',
    description: 'Drago Bianco Occhi Blu, Signore dei D., Vortice Distruttivo e potenza bruta.',
    main: [...x('Blue-Eyes White Dragon', 3), ...x('Lord of D.', 2), ...x('Kaiser Sea Horse', 2), 'Vorse Raider', 'La Jinn the Mystical Genie of the Lamp', 'Battle Ox', 'Luster Dragon', 'Luster Dragon #2', 'Spear Dragon', 'X-Head Cannon', 'Y-Dragon Head', 'Z-Metal Tank', 'Saggi the Dark Clown', 'Cyber Jar', 'Kaibaman', 'Familiar Knight', 'Blade Knight', 'The Flute of Summoning Dragon', 'Burst Stream of Destruction', 'Polymerization', 'Monster Reborn', 'Pot of Greed', 'Enemy Controller', 'Shrink', 'Heavy Storm', 'Mystical Space Typhoon', 'Silent Doom', 'Cost Down', 'Soul Exchange', 'Dragon\'s Mirror', 'Crush Card Virus', 'Negate Attack', 'Ring of Destruction', 'Interdimensional Matter Transporter', 'Cloning', 'Shadow Spell'],
    extra: ['Blue-Eyes Ultimate Dragon', 'XYZ-Dragon Cannon', 'XY-Dragon Cannon', 'XZ-Tank Cannon', 'YZ-Tank Dragon'],
  },
  {
    id: 'joey',
    section: 'dm',
    name: 'Joey Wheeler',
    cover: 'Red-Eyes Black Dragon',
    accent: '#d6483c',
    description: 'Drago Nero Occhi Rossi, guerrieri fortunati e un pizzico di azzardo.',
    main: [...x('Red-Eyes Black Dragon', 2), ...x('Gearfried the Iron Knight', 2), 'Jinzo', 'Rocket Warrior', 'Panther Warrior', ...x('Axe Raider', 2), 'Baby Dragon', 'Time Wizard', 'Swordsman of Landstar', 'Little-Winguard', 'Gearfried the Swordmaster', 'Gilford the Lightning', 'Sword Hunter', 'Copycat', 'Hayabusa Knight', 'Insect Queen', 'Goblin Attack Force', 'Gearfried the Swordmaster', 'Marauding Captain', 'Graceful Dice', 'Scapegoat', 'Shield & Sword', 'Giant Trunade', 'Pot of Greed', 'Monster Reborn', 'Polymerization', 'Lightning Blade', 'Salamandra', 'Inferno Fire Blast', 'Question', 'Skull Dice', 'Kunai with Chain', 'Graverobber', 'Fairy Box', 'Metalmorph', 'Trap Hole', 'Drop Off'],
    extra: ['Black Skull Dragon', 'Thousand Dragon'],
  },
  {
    id: 'pegasus',
    section: 'dm',
    name: 'Maximillion Pegasus',
    cover: 'Blue-Eyes Toon Dragon',
    accent: '#e07bb8',
    description: 'Mondo Toon: mostri cartoon che attaccano direttamente, Relinquished e Cerchio dei Mille Occhi.',
    main: ['Blue-Eyes Toon Dragon', 'Toon Summoned Skull', 'Toon Mermaid', 'Toon Dark Magician Girl', 'Toon Gemini Elf', 'Toon Goblin Attack Force', 'Toon Masked Sorcerer', 'Toon Cannon Soldier', 'Manga Ryu-Ran', ...x('Toon Alligator', 2), 'Relinquished', 'Thousand-Eyes Idol', 'Parrot Dragon', 'Illusionist Faceless Mage', 'Ryu-Ran', 'Red Archery Girl', 'Dragon Piper', 'Dragon Piper', 'Sangan', 'Toon World', ...x('Toon Table of Contents', 3), ...x('Black Illusion Ritual', 2), ...x('Pot of Greed', 2), 'Graceful Charity', 'Mystical Space Typhoon', 'Dark Hole', 'Change of Heart', 'Snatch Steal', 'Toon Defense', 'Mirror Force', 'Magic Cylinder', 'Sakuretsu Armor', 'Solemn Judgment', 'Gorgon\'s Eye', 'Trap Hole'],
    extra: ['Thousand-Eyes Restrict', 'Bickuribox'],
  },
  {
    id: 'mai',
    section: 'dm',
    name: 'Mai Valentine',
    cover: 'Harpie Lady',
    accent: '#e0a752',
    description: 'Le Signore Arpie, Cyber Shield e il Drago da Guardia delle Arpie.',
    main: [...x('Harpie Lady', 3), ...x('Harpie Lady Sisters', 3), 'Harpie Lady 1', 'Harpie Lady 2', 'Harpie Lady 3', 'Harpie\'s Pet Dragon', 'Harpie Girl', 'Harpie Queen', 'Cyber Harpie Lady', 'Birdface', 'Amazoness Paladin', 'Amazoness Swords Woman', 'Amazoness Chain Master', 'Sonic Duck', 'Flying Kamakiri #1', 'Hysteric Fairy', ...x('Elegant Egotist', 2), ...x('Harpie\'s Feather Duster', 2), ...x('Harpies\' Hunting Ground', 2), 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Triangle Ecstasy Spark', 'Rising Air Current', 'Mirror Force', 'Sakuretsu Armor', 'Shadow of Eyes', 'Mirror Wall', 'Amazoness Archers', 'Aqua Chorus', 'Hysteric Party', 'Icarus Attack'],
    extra: [],
  },
  {
    id: 'bakura',
    section: 'dm',
    name: 'Bakura',
    cover: 'Dark Necrofear',
    accent: '#8a7bd6',
    description: 'Occulto: zombie, demoni, Dark Necrofear e le trappole del Ladro di Tombe.',
    main: ['Dark Necrofear', 'Headless Knight', 'Earthbound Spirit', 'The Portrait\'s Secret', 'The Gross Ghost of Fled Dreams', 'Dark Ruler Ha Des', ...x('Sangan', 2), 'Morphing Jar', 'Jowgen the Spiritualist', 'Souls of the Forgotten', ...x('Giant Germ', 2), 'Goblin Zombie', 'Man-Eater Bug', 'Spirit Reaper', 'Pyramid Turtle', 'Vampire Lord', 'Ryu Kokki', 'Regenerating Mummy', 'Zombie Master', 'Dark Spirit of the Silent', 'The Dark Door', 'Pot of Greed', 'Monster Reborn', 'Book of Life', 'Call of the Mummy', 'Mystical Space Typhoon', 'Heavy Storm', 'Premature Burial', 'Card of Safe Return', 'Dark Designator', 'Destiny Board', 'Spirit Message "I"', 'Spirit Message "N"', 'Spirit Message "A"', 'Spirit Message "L"', 'Just Desserts', 'Dark Coffin', 'Ectoplasmer'],
    extra: [],
  },
  {
    id: 'marik',
    section: 'dm',
    name: 'Marik Ishtar',
    cover: 'Lava Golem',
    accent: '#c9a227',
    description: 'Danni da effetto e trappole punitive: Golem di Lava, Barile Segreto, Hane-Hane e Drillago.',
    main: [...x('Lava Golem', 2), 'Helpoemer', 'Drillago', 'Legendary Fiend', 'Gil Garth', ...x('Dark Jeroid', 2), 'Newdoria', 'Makyura the Destructor', 'Byser Shock', 'Bowganian', 'Slime Toad', 'Lord Poison', 'Melchid the Four-Face Beast', 'Masked Beast Des Gardius', 'Sangan', 'Hane-Hane', 'Morphing Jar', 'Cyber Jar', ...x('Nightmare Wheel', 2), 'Mask of the Accursed', 'Curse of the Masked Beast', 'Pot of Greed', 'Card Destruction', 'Malevolent Nuzzler', 'Dark Hole', 'Mystical Space Typhoon', 'Dark Snake Syndrome', 'Ectoplasmer', 'Mask of Restrict', 'Secret Barrel', 'Just Desserts', 'Ojama Trio', 'Coffin Seller', 'Mirror Force', 'Metal Reflect Slime', 'Gravity Bind', 'Magic Cylinder'],
    extra: [],
  },
  {
    id: 'rex',
    section: 'dm',
    name: 'Rex Raptor',
    cover: 'Black Tyranno',
    accent: '#7fbf4a',
    description: 'Dinosauri e Mondo Giurassico: pressione fisica e Tirannosauro Nero.',
    main: [...x('Black Tyranno', 2), ...x('Two-Headed King Rex', 2), 'Crawling Dragon #2', ...x('Mad Sword Beast', 2), 'Crawling Dragon', ...x('Uraby', 2), 'Tyranno Infinity', ...x('Gilasaurus', 2), 'Element Saurus', 'Hyper Hammerhead', 'Black Stego', 'Miracle Jurassic Egg', 'Kabazauls', 'Sabersaurus', 'Dark Driceratops', ...x('Jurassic World', 2), 'Big Evolution Pill', 'Fossil Excavation', 'Tail Swipe', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Lightning Vortex', 'Raise Body Heat', 'Smashing Ground', 'Mirror Force', 'Sakuretsu Armor', 'Volcanic Eruption', 'Hunting Instinct', 'Seismic Shockwave', 'Dust Tornado', 'Torrential Tribute', 'Survival Instinct'],
    extra: [],
  },
  {
    id: 'weevil',
    section: 'dm',
    name: 'Weevil Underwood',
    cover: 'Insect Queen',
    accent: '#6fbf3a',
    description: 'Insetti, Regina Insetto, Falena Perfetta e le trappole della Grande Falena.',
    main: [...x('Insect Queen', 2), 'Perfectly Ultimate Great Moth', 'Great Moth', ...x('Petit Moth', 2), 'Larvae Moth', 'Basic Insect', 'Killer Needle', 'Hercules Beetle', ...x('Flying Kamakiri #1', 2), ...x('Pinch Hopper', 2), 'Parasite Paracide', ...x('Man-Eater Bug', 2), 'Leghul', ...x('Insect Knight', 2), 'Skull-Mark Ladybug', 'Neo Bug', ...x('Cocoon of Evolution', 2), ...x('Insect Barrier', 2), 'Insect Imitation', 'Forest', 'Laser Cannon Armor', 'Pot of Greed', 'Monster Reborn', ...x('Mystical Space Typhoon', 2), 'Multiplication of Ants', 'DNA Surgery', 'Mirror Force', ...x('Sakuretsu Armor', 2), 'Trap Hole', 'Dust Tornado'],
    extra: [],
  },
  {
    id: 'mako',
    section: 'dm',
    name: 'Mako Tsunami',
    cover: 'The Legendary Fisherman',
    accent: '#3fa7d6',
    description: 'Umi, Il Leggendario Pescatore, Fortezza Balena e i mostri del mare.',
    main: [...x('The Legendary Fisherman', 2), 'Fortress Whale', 'Great White', ...x('Jellyfish', 2), ...x('Amphibian Beast', 2), ...x('7 Colored Fish', 2), ...x('Giant Red Seasnake', 2), 'Deepsea Warrior', 'Levia-Dragon - Daedalus', 'Ocean Dragon Lord - Neo-Daedalus', ...x('Mermaid Knight', 2), ...x('Mother Grizzly', 2), 'Sangan', 'Sea Serpent Warrior of Darkness', 'Abyss Soldier', 'Warrior of Atlantis', ...x('Umi', 2), ...x('A Legendary Ocean', 2), 'Fortress Whale\'s Oath', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', ...x('Salvage', 2), ...x('Tornado Wall', 2), 'Torrential Tribute', 'Mirror Force', 'Sakuretsu Armor', 'Gravity Bind'],
    extra: [],
  },
  {
    id: 'keith',
    section: 'dm',
    name: 'Bandit Keith',
    cover: 'Barrel Dragon',
    accent: '#8f9aa8',
    description: 'Macchine e canne: Drago Barile, Soldato Cannone e Rimozione Limitatore.',
    main: [...x('Barrel Dragon', 2), ...x('Blowback Dragon', 2), ...x('Cannon Soldier', 2), 'Slot Machine', 'Launcher Spider', 'Metalzoa', 'Zoa', ...x('Mechanicalchaser', 2), 'Cyber-Stein', 'Machine King', 'Mechanical Snail', ...x('Cyber Dragon', 2), 'Heavy Mech Support Platform', 'Giant Orc', 'Robotic Knight', ...x('Limiter Removal', 2), ...x('7 Completed', 2), 'Machine Conversion Factory', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', ...x('Metalmorph', 2), 'Smashing Ground', 'Soul Exchange', 'Mirror Force', 'Sakuretsu Armor', 'Solemn Judgment', ...x('Dust Tornado', 2), 'Magic Cylinder', 'Trap Hole'],
    extra: ['Cyber Twin Dragon', 'Gatling Dragon'],
  },
  {
    id: 'ishizu',
    section: 'dm',
    name: 'Ishizu Ishtar',
    cover: 'Agido',
    accent: '#e8dcae',
    description: 'Fate della tomba: Zolga, Agido, Kelbek e le trappole del destino.',
    main: [...x('Zolga', 2), ...x('Agido', 2), ...x('Kelbek', 2), ...x('Keldo', 2), ...x('Mudora', 2), 'Guardian Sphinx', ...x('Gravekeeper\'s Spy', 2), 'Gravekeeper\'s Guard', 'Gravekeeper\'s Chief', 'Gravekeeper\'s Assailant', ...x('Shining Angel', 2), 'Airknight Parshath', 'Hysteric Fairy', ...x('Necrovalley', 2), 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Swords of Revealing Light', 'Smashing Ground', 'Nobleman of Crossout', 'Exchange', 'Book of Moon', 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Solemn Judgment', 'Bottomless Trap Hole', 'Magic Cylinder', 'Rite of Spirit', 'Blast Held by a Tribute', 'Muko'],
    extra: [],
  },
  {
    id: 'odion',
    section: 'dm',
    name: 'Odion',
    cover: 'Embodiment of Apophis',
    accent: '#b0783c',
    description: 'Tempio dei Re e la Bestia Mistica di Serket: un muro di trappole.',
    main: [...x('Sangan', 3), 'Jinzo', 'Morphing Jar', 'Cyber Jar', ...x('Spirit Reaper', 2), 'Marshmallon', ...x('Gravekeeper\'s Spy', 2), 'Man-Eater Bug', 'Old Vindictive Magician', 'Night Assailant', ...x('Dekoichi the Battlechanted Locomotive', 2), ...x('Threatening Roar', 2), 'Pot of Greed', 'Mystical Space Typhoon', 'Swords of Revealing Light', 'Messenger of Peace', 'Level Limit - Area B', 'Book of Moon', ...x('Embodiment of Apophis', 3), 'Mirror Force', 'Magic Cylinder', ...x('Sakuretsu Armor', 2), 'Torrential Tribute', 'Trap Hole', 'Bottomless Trap Hole', 'Gravity Bind', 'Judgment of Anubis', 'Widespread Ruin', ...x('Waboku', 2), 'Negate Attack'],
    extra: [],
  },
  {
    id: 'duke',
    section: 'dm',
    name: 'Duke Devlin',
    cover: 'Strike Ninja',
    accent: '#d64f9f',
    description: 'Dungeon Dice Monsters in salsa carte: dadi, Orgoth e Roll of Fate.',
    main: [...x('Strike Ninja', 3), ...x('Blade Knight', 2), ...x('Gearfried the Iron Knight', 2), ...x('Dice Jar', 2), 'Gambler of Legend', 'Twin-Headed Behemoth', 'Sangan', 'Cyber Jar', 'Exiled Force', 'D.D. Warrior Lady', 'D.D. Assailant', ...x('Marauding Captain', 2), 'Mystic Swordsman LV2', 'Command Knight', ...x('Dice Re-Roll', 2), 'Graceful Dice', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Reinforcement of the Army', 'Lightning Blade', 'Smashing Ground', 'Snatch Steal', ...x('Skull Dice', 2), 'Mirror Force', ...x('Sakuretsu Armor', 2), ...x('Blind Destruction', 2), 'Dice Try!', 'Magic Cylinder'],
    extra: [],
  },
  {
    id: 'exodia',
    section: 'dm',
    name: 'Yugi (Exodia)',
    cover: 'Exodia the Forbidden One',
    accent: '#c9a227',
    description: 'Il primo duello contro Kaiba: raccogli i cinque pezzi di Exodia.',
    main: ['Exodia the Forbidden One', 'Right Arm of the Forbidden One', 'Left Arm of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One', ...x('Sangan', 3), ...x('Witch of the Black Forest', 2), ...x('Mystical Elf', 2), ...x('Kuriboh', 2), 'Marshmallon', 'Spirit Reaper', ...x('Big Shield Gardna', 2), 'Dark Magician', 'Summoned Skull', 'Pot of Greed', 'Graceful Charity', ...x('Upstart Goblin', 2), 'Card Destruction', ...x('Swords of Revealing Light', 2), 'Messenger of Peace', 'Level Limit - Area B', 'Dark Factory of Mass Production', 'Backup Soldier', 'Gravity Bind', ...x('Waboku', 3), ...x('Threatening Roar', 2), ...x('Jar of Greed', 2), 'Reckless Greed'],
    extra: [],
  },
  {
    id: 'jaden',
    section: 'gx',
    name: 'Jaden Yuki',
    cover: 'Elemental HERO Flame Wingman',
    accent: '#e0703c',
    description: 'Gli Elemental HERO: fusioni con Polimerizzazione e Fusione Miracolosa, Kuriboh Alato.',
    main: [...x('Elemental HERO Avian', 2), ...x('Elemental HERO Burstinatrix', 2), ...x('Elemental HERO Sparkman', 2), ...x('Elemental HERO Clayman', 2), 'Elemental HERO Bubbleman', 'Elemental HERO Wildheart', 'Elemental HERO Bladedge', 'Elemental HERO Necroshade', 'Elemental HERO Neos', 'Elemental HERO Stratos', ...x('Winged Kuriboh', 2), 'Wroughtweiler', ...x('Hero Kid', 2), 'Card Trooper', ...x('Polymerization', 2), 'Miracle Fusion', 'Fusion Recovery', 'Fusion Sage', 'O - Oversoul', 'R - Righteous Justice', 'H - Heated Heart', 'E - Emergency Call', 'Skyscraper', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Transcendent Wings', 'Hero Signal', 'Hero Barrier', 'Mirror Force', 'Draining Shield', 'A Hero Emerges', 'Negate Attack'],
    extra: [...x('Elemental HERO Flame Wingman', 2), 'Elemental HERO Shining Flare Wingman', 'Elemental HERO Thunder Giant', 'Elemental HERO Rampart Blaster', 'Elemental HERO Steam Healer', 'Elemental HERO Mudballman', 'Elemental HERO Wildedge', 'Elemental HERO Necroid Shaman', 'Elemental HERO Electrum', 'Elemental HERO Tempest', 'Elemental HERO Mariner'],
  },
  {
    id: 'zane',
    section: 'gx',
    name: 'Zane Truesdale',
    cover: 'Cyber End Dragon',
    accent: '#4fc4e0',
    description: 'Cyber Dragon e le fusioni Cyber: Twin, End e Legame di Potere.',
    main: [...x('Cyber Dragon', 3), ...x('Proto-Cyber Dragon', 2), ...x('Cyber Phoenix', 2), 'Cyber Laser Dragon', 'Cyber Barrier Dragon', ...x('Cyber Kirin', 2), ...x('Cyber Ogre', 2), ...x('Cyber Valley', 2), 'Cyber Dinosaur', 'Sangan', 'Cyber Jar', ...x('Machine Duplication', 2), ...x('Power Bond', 2), ...x('Polymerization', 2), 'Photon Generator Unit', 'Attack Reflector Unit', ...x('Fusion Recovery', 2), 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Limiter Removal', ...x('Cyber Shadow Gardna', 2), 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Bottomless Trap Hole', 'Call of the Haunted'],
    extra: [...x('Cyber Twin Dragon', 2), ...x('Cyber End Dragon', 2), 'Cyber Ogre 2', 'Chimeratech Overdragon'],
  },
  {
    id: 'chazz',
    section: 'gx',
    name: 'Chazz Princeton',
    cover: 'Armed Dragon LV7',
    accent: '#5c5c6e',
    description: 'Ojama, Drago Armato LV e i mostri XYZ: caos controllato.',
    main: [...x('Ojama Yellow', 2), ...x('Ojama Green', 2), ...x('Ojama Black', 2), ...x('Armed Dragon LV3', 2), ...x('Armed Dragon LV5', 2), 'Armed Dragon LV7', 'Armed Dragon LV10', ...x('X-Head Cannon', 2), ...x('Y-Dragon Head', 2), ...x('Z-Metal Tank', 2), 'V-Tiger Jet', 'W-Wing Catapult', ...x('Masked Dragon', 2), ...x('Ojamagic', 2), 'Ojama Delta Hurricane!!', ...x('Level Up!', 2), 'Polymerization', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Frontline Base', 'Chthonian Polymer', ...x('Ojama Trio', 2), 'Chthonian Blast', 'Mirror Force', 'Sakuretsu Armor', 'Call of the Haunted'],
    extra: [...x('Ojama King', 2), 'XYZ-Dragon Cannon', 'XY-Dragon Cannon', 'XZ-Tank Cannon', 'YZ-Tank Dragon', 'VW-Tiger Catapult', 'VWXYZ-Dragon Catapult Cannon'],
  },
  {
    id: 'alexis',
    section: 'gx',
    name: 'Alexis Rhodes',
    cover: 'Cyber Blader',
    accent: '#e07bb8',
    description: 'Le Cyber Girls: Etoile Cyber, Blade Skater, Cyber Blader e gli Angeli Cyber.',
    main: [...x('Etoile Cyber', 3), ...x('Blade Skater', 3), ...x('Cyber Tutu', 2), ...x('Cyber Gymnast', 2), ...x('Cyber Prima', 2), ...x('Hysteric Fairy', 2), ...x('Shining Angel', 2), 'Airknight Parshath', 'Marshmallon', 'Sangan', 'Cyber Jar', ...x('Gemini Elf', 2), ...x('Polymerization', 3), ...x('Fusion Recovery', 2), 'Fusion Sage', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Smashing Ground', 'Book of Moon', 'Fusion Weapon', 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Hallowed Life Barrier', 'Call of the Haunted'],
    extra: [...x('Cyber Blader', 2)],
  },
  {
    id: 'bastion',
    section: 'gx',
    name: 'Bastion Misawa',
    cover: 'Water Dragon',
    accent: '#3f7fd6',
    description: 'Chimica applicata: Hydrogeddon, Oxygeddon, Bonding H2O e Drago d\'Acqua.',
    main: [...x('Hydrogeddon', 3), ...x('Oxygeddon', 3), ...x('Water Dragon', 2), ...x('Mermaid Knight', 2), ...x('Mother Grizzly', 3), ...x('Ring of Magnetism', 2), 'Sangan', 'Cyber Jar', 'Amphibian Beast', 'Warrior of Atlantis', ...x('Abyss Soldier', 2), ...x('Bonding - H2O', 3), ...x('Salvage', 2), ...x('Tornado Wall', 2), 'A Legendary Ocean', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Magic Cylinder', 'Gravity Bind', 'Bottomless Trap Hole', 'Call of the Haunted'],
    extra: [],
  },
  {
    id: 'syrus',
    section: 'gx',
    name: 'Syrus Truesdale',
    cover: 'Super Vehicroid Jumbo Drill',
    accent: '#6fb1e0',
    description: 'I Vehicroid: Steamroid, Drillroid, Gyroid e le fusioni di Cavalcata Vehicroid.',
    main: [...x('Steamroid', 3), ...x('Drillroid', 2), ...x('Gyroid', 2), ...x('Submarineroid', 2), ...x('Truckroid', 2), ...x('Jetroid', 2), ...x('Patroid', 2), ...x('Expressroid', 2), 'Cycroid', 'Stealthroid', 'Rescueroid', ...x('Polymerization', 2), ...x('Vehicroid Connection Zone', 2), ...x('Shield Crush', 2), 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Limiter Removal', 'Fusion Recovery', ...x('Supercharge', 2), 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Bottomless Trap Hole', 'Call of the Haunted', 'Rare Metalmorph'],
    extra: [...x('Super Vehicroid Jumbo Drill', 2), ...x('Steam Gyroid', 2), 'Super Vehicroid - Stealth Union'],
  },
  {
    id: 'aster',
    section: 'gx',
    name: 'Aster Phoenix',
    cover: 'Destiny HERO - Plasma',
    accent: '#8a5cf0',
    description: 'I Destiny HERO: Malicious, Disk Commander, Dogma e Plasma con Pesca del Destino.',
    main: [...x('Destiny HERO - Malicious', 3), 'Destiny HERO - Disk Commander', ...x('Destiny HERO - Dasher', 2), ...x('Destiny HERO - Doom Lord', 2), 'Destiny HERO - Captain Tenacious', ...x('Destiny HERO - Diamond Dude', 2), 'Destiny HERO - Fear Monger', 'Destiny HERO - Defender', 'Destiny HERO - Dogma', 'Destiny HERO - Plasma', 'Destiny HERO - Blade Master', 'Elemental HERO Stratos', ...x('Card Trooper', 2), 'Necro Gardna', ...x('Destiny Draw', 3), ...x('Over Destiny', 2), 'Clock Tower Prison', 'Reinforcement of the Army', 'E - Emergency Call', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Polymerization', 'Miracle Fusion', 'D - Time', 'D - Chain', 'Eternal Dread', 'Mirror Force', 'Torrential Tribute', 'Bottomless Trap Hole'],
    extra: [...x('Destiny End Dragoon', 2), 'Elemental HERO Flame Wingman'],
  },
  {
    id: 'jesse',
    section: 'gx',
    name: 'Jesse Anderson',
    cover: 'Rainbow Dragon',
    accent: '#4fc47a',
    description: 'Le Bestie Cristallo: Rubino, Topazio, Zaffiro e il Drago Arcobaleno.',
    main: [...x('Crystal Beast Ruby Carbuncle', 2), ...x('Crystal Beast Topaz Tiger', 2), ...x('Crystal Beast Sapphire Pegasus', 3), ...x('Crystal Beast Amethyst Cat', 2), 'Crystal Beast Emerald Tortoise', 'Crystal Beast Cobalt Eagle', ...x('Crystal Beast Amber Mammoth', 2), ...x('Rainbow Dragon', 2), ...x('Crystal Beacon', 2), 'Crystal Blessing', 'Crystal Abundance', ...x('Crystal Promise', 2), 'Crystal Release', 'Crystal Tree', 'Rare Value', ...x('Ancient City - Rainbow Ruins', 2), 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Rainbow Gravity', ...x('Crystal Raigeki', 2), 'Crystal Pair', 'Last Resort', 'Gem Flash Energy', 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Rainbow Path'],
    extra: [],
  },
  {
    id: 'axel',
    section: 'gx',
    name: 'Axel Brodie',
    cover: 'Volcanic Doomfire',
    accent: '#e0503f',
    description: 'I Volcanic e l\'Acceleratore di Fiamme: danni continui e Volcanic Doomfire.',
    main: [...x('Volcanic Shell', 3), ...x('Volcanic Scattershot', 3), ...x('Volcanic Rocket', 3), ...x('Volcanic Slicer', 2), ...x('Volcanic Hammerer', 2), ...x('Volcanic Doomfire', 2), ...x('Volcanic Counter', 2), ...x('UFO Turtle', 2), 'Sangan', ...x('Blaze Accelerator', 3), ...x('Tri-Blaze Accelerator', 2), 'Volcanic Recharge', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', ...x('Molten Destruction', 2), ...x('Wild Fire', 2), 'Firewall', 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Bottomless Trap Hole', 'Backfire'],
    extra: [],
  },
  {
    id: 'hassleberry',
    section: 'gx',
    name: 'Tyranno Hassleberry',
    cover: 'Ultimate Tyranno',
    accent: '#7fbf4a',
    description: 'Dinosauri moderni: Dark Driceratops, Ultimate Tyranno, Hyper Hammerhead e Big Evolution Pill.',
    main: [...x('Ultimate Tyranno', 2), ...x('Dark Driceratops', 2), 'Black Tyranno', ...x('Hyper Hammerhead', 2), ...x('Sabersaurus', 2), ...x('Kabazauls', 2), ...x('Gilasaurus', 2), ...x('Black Stego', 2), ...x('Miracle Jurassic Egg', 2), ...x('Babycerasaurus', 2), 'Element Saurus', 'Super-Ancient Dinobeast', 'Big Evolution Pill', ...x('Jurassic World', 2), 'Tail Swipe', 'Fossil Excavation', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Smashing Ground', 'Lightning Vortex', 'Volcanic Eruption', ...x('Hunting Instinct', 2), 'Seismic Shockwave', 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Survival Instinct'],
    extra: [],
  },
  {
    id: 'crowler',
    section: 'gx',
    name: 'Dr. Crowler',
    cover: 'Ancient Gear Golem',
    accent: '#b8862a',
    description: 'Gli Antichi Ingranaggi: Golem, Bestia, Soldato e il Castello degli Antichi Ingranaggi.',
    main: [...x('Ancient Gear Golem', 3), ...x('Ancient Gear Beast', 2), ...x('Ancient Gear Soldier', 3), ...x('Ancient Gear Knight', 2), ...x('Ancient Gear Engineer', 2), 'Ancient Gear Cannon', ...x('Ancient Gear', 2), 'Ancient Gear Gadjiltron Dragon', 'Ancient Gear Gadjiltron Chimera', 'Green Gadget', 'Red Gadget', 'Yellow Gadget', ...x('Ancient Gear Castle', 2), 'Ancient Gear Factory', 'Ancient Gear Drill', 'Ancient Gear Workshop', 'Ancient Gear Tank', 'Ancient Gear Fist', ...x('Geartown', 2), 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Polymerization', ...x('Ancient Gear Explosive', 2), 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Bottomless Trap Hole'],
    extra: [...x('Ultimate Ancient Gear Golem', 2)],
  },
  {
    id: 'camula',
    section: 'gx',
    name: 'Camula',
    cover: 'Vampire Genesis',
    accent: '#a03060',
    description: 'Vampiri e zombie: Signore dei Vampiri, Genesi Vampiro e Fanciulla Ghiacciata.',
    main: [...x('Vampire Lord', 2), ...x('Vampire Lady', 2), ...x('Vampire Genesis', 2), ...x('Vampire Baby', 2), 'Vampire\'s Curse', ...x('Spirit Reaper', 2), ...x('Pyramid Turtle', 3), ...x('Ryu Kokki', 2), 'Regenerating Mummy', ...x('Zombie Master', 2), 'Goblin Zombie', 'Mezuki', 'Il Blud', ...x('Book of Life', 2), ...x('Call of the Mummy', 2), 'Card of Safe Return', ...x('Foolish Burial', 2), 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Premature Burial', 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Bottomless Trap Hole', 'Call of the Haunted', 'Mask of Weakness'],
    extra: [],
  },
  {
    id: 'adrian',
    section: 'gx',
    name: 'Adrian Gecko',
    cover: 'Cloudian - Eye of the Typhoon',
    accent: '#9fc7e8',
    description: 'I Cloudian: nuvole con Segnalini Nebbia, Sheep Cloud e il Tifone Cloudian.',
    main: [...x('Cloudian - Sheep Cloud', 3), ...x('Cloudian - Smoke Ball', 3), ...x('Cloudian - Turbulence', 2), ...x('Cloudian - Cirrostratus', 2), ...x('Cloudian - Altus', 2), ...x('Cloudian - Nimbusman', 2), ...x('Cloudian - Poison Cloud', 2), 'Cloudian - Acid Cloud', ...x('Cloudian - Eye of the Typhoon', 2), 'Cloudian - Ghost Fog', ...x('Fog Control', 2), ...x('Summon Cloud', 2), ...x('Cloudian Squall', 2), 'Diamond-Dust Cyclone', 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Level Limit - Area B', 'Messenger of Peace', ...x('Natural Disaster', 2), 'Updraft', 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Gravity Bind'],
    extra: [],
  },
  {
    id: 'sartorius',
    section: 'gx',
    name: 'Sartorius',
    cover: 'Arcana Force XXI - The World',
    accent: '#c0b8e8',
    description: 'Arcana Force: i tarocchi della Luce della Distruzione, lanci di moneta e Il Mondo.',
    main: [...x('Arcana Force 0 - The Fool', 2), ...x('Arcana Force I - The Magician', 2), ...x('Arcana Force III - The Empress', 2), ...x('Arcana Force IV - The Emperor', 2), ...x('Arcana Force VI - The Lovers', 2), ...x('Arcana Force VII - The Chariot', 2), ...x('Arcana Force XIV - Temperance', 2), 'Arcana Force XVIII - The Moon', ...x('Arcana Force XXI - The World', 2), 'Sangan', 'Cyber Jar', 'Morphing Jar', ...x('Cup of Ace', 2), ...x('Light Barrier', 2), ...x('Second Coin Toss', 2), 'Pot of Greed', 'Monster Reborn', 'Mystical Space Typhoon', 'Heavy Storm', 'Level Limit - Area B', 'Messenger of Peace', ...x('Reversal of Fate', 2), 'Tour of Doom', 'Mirror Force', 'Sakuretsu Armor', 'Torrential Tribute', 'Gravity Bind', 'Waboku'],
    extra: [],
  },
  {
    id: 'hero',
    section: 'base',
    name: 'Elemental HERO',
    cover: 'Elemental HERO Flame Wingman',
    accent: '#e0703c',
    description: 'Il deck di Jaden: fusioni HERO con Polimerizzazione e Fusione Miracolosa, Stratos e Card Trooper.',
    main: [
      ...x('Elemental HERO Stratos', 2), ...x('Elemental HERO Avian', 2), ...x('Elemental HERO Burstinatrix', 2), ...x('Elemental HERO Sparkman', 2),
      'Elemental HERO Clayman', 'Elemental HERO Wildheart', 'Elemental HERO Bladedge', 'Elemental HERO Prisma', 'Elemental HERO Neos',
      ...x('Card Trooper', 2), ...x('Destiny HERO - Malicious', 2), 'Necro Gardna',
      ...x('Polymerization', 2), ...x('Miracle Fusion', 2), ...x('E - Emergency Call', 2), 'Reinforcement of the Army', 'Pot of Greed', 'Graceful Charity',
      'Monster Reborn', 'Heavy Storm', 'Mystical Space Typhoon', 'Skyscraper', 'Metamorphosis', 'Fusion Recovery',
      'Mirror Force', ...x('Sakuretsu Armor', 2), 'Bottomless Trap Hole', 'Torrential Tribute', 'Threatening Roar', 'Call of the Haunted',
    ],
    extra: [...x('Elemental HERO Flame Wingman', 2), 'Elemental HERO Shining Flare Wingman', 'Elemental HERO Thunder Giant', 'Elemental HERO Wildedge', 'Elemental HERO Rampart Blaster', 'Elemental HERO Steam Healer', 'Elemental HERO Mudballman'],
  },
  {
    id: 'monarch',
    section: 'base',
    name: 'Monarchi',
    cover: 'Zaborg the Thunder Monarch',
    accent: '#3fa7d6',
    description: 'Tributi che distruggono, scartano e bandiscono; Cyber Dragon, Treeborn Frog e mostri flip per i tributi.',
    main: [
      ...x('Zaborg the Thunder Monarch', 2), ...x('Mobius the Frost Monarch', 2), ...x('Thestalos the Firestorm Monarch', 2), 'Raiza the Storm Monarch', 'Caius the Shadow Monarch',
      ...x('Cyber Dragon', 2), ...x('Treeborn Frog', 2), ...x('Apprentice Magician', 2), ...x("Gravekeeper's Spy", 2),
      ...x('Dekoichi the Battlechanted Locomotive', 2), 'Sangan', 'Spirit Reaper', 'Marshmallon', 'Breaker the Magical Warrior',
      'Snatch Steal', 'Brain Control', ...x('Enemy Controller', 2), 'Smashing Ground', 'Lightning Vortex', 'Premature Burial', ...x('Book of Moon', 2), 'Nobleman of Crossout', 'Pot of Greed', 'Heavy Storm',
      'Mirror Force', 'Torrential Tribute', ...x('Sakuretsu Armor', 2), 'Dust Tornado', 'Widespread Ruin',
    ],
    extra: ['Cyber Twin Dragon', 'Cyber End Dragon'],
  },
  {
    id: 'junk',
    section: 'base',
    name: 'Guerrieri Synchro',
    cover: 'Junk Warrior',
    accent: '#b39cff',
    description: 'Mostri di basso livello, Junk Synchron e un Extra Deck di Synchro. Ritmo veloce.',
    main: [
      ...x('Junk Synchron', 3), ...x('Speed Warrior', 2), ...x('Marauding Captain', 2), 'Exiled Force', ...x('Goblin Attack Force', 2),
      ...x('Gemini Elf', 2), 'Sangan', ...x('Mystic Tomato', 2), ...x('Man-Eater Bug', 2), 'Jinzo', 'Summoned Skull', 'Marshmallon',
      'Pot of Greed', 'Graceful Charity', 'Monster Reborn', 'Dark Hole', 'Raigeki', 'Mystical Space Typhoon', 'Swords of Revealing Light',
      'Change of Heart', 'Book of Moon', 'Axe of Despair', 'Fissure', 'Smashing Ground',
      'Mirror Force', ...x('Sakuretsu Armor', 2), ...x('Trap Hole', 2), 'Magic Cylinder', 'Call of the Haunted', 'Torrential Tribute',
    ],
    extra: [...x('Junk Warrior', 2), 'Goyo Guardian', 'Black Rose Dragon', 'Stardust Dragon', 'Colossal Fighter', 'Red Dragon Archfiend'],
  },
  {
    id: 'dragons',
    section: 'base',
    name: 'Draghi e Fusioni',
    cover: 'Blue-Eyes White Dragon',
    accent: '#5b8def',
    description: 'Drago Bianco Occhi Blu, tributi pesanti e fusioni con Polimerizzazione. Potenza bruta.',
    main: [
      ...x('Blue-Eyes White Dragon', 3), 'Lord of D.', ...x('Gazelle the King of Mythical Beasts', 2), ...x('Berfomet', 2), 'Summoned Skull',
      'Red-Eyes Black Dragon', ...x('Luster Dragon', 2), 'Kaiser Sea Horse', ...x('Giant Rat', 2), ...x('Shining Angel', 2),
      'Witch of the Black Forest', 'Penguin Soldier', 'Old Vindictive Magician',
      ...x('Polymerization', 2), 'Pot of Greed', 'Graceful Charity', 'Monster Reborn', 'Dark Hole', 'Heavy Storm', 'Mystical Space Typhoon',
      'Nobleman of Crossout', 'Hammer Shot', 'Malevolent Nuzzler', 'Tribute to the Doomed',
      'Mirror Force', ...x('Waboku', 2), ...x('Bottomless Trap Hole', 2), 'Dimensional Prison', 'Negate Attack', 'Dust Tornado',
    ],
    extra: ['Blue-Eyes Ultimate Dragon', ...x('Chimera the Flying Mythical Beast', 2), 'Black Skull Dragon'],
  },
];

/** Deck salvato dall'utente (id delle carte). */
export interface SavedDeck {
  id: string;
  name: string;
  main: number[];
  extra: number[];
}

const KEY = 'yugioh.decks';

export function loadSavedDecks(): SavedDeck[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedDeck[];
  } catch {
    return [];
  }
}

export function saveDecks(decks: SavedDeck[]): void {
  localStorage.setItem(KEY, JSON.stringify(decks));
}
