/* Synergy — built-in hero list and a backup copy of the team-up list.
   The live list (with effect text) comes from the Worker; this file is only used for
   hero art and roles, and as a fallback if the Worker's list is missing.
   Hero ids match RivalsMeta / the game. New heroes the Worker reports that aren't
   listed here still show up automatically (with initials until art is added). */

// [id, name, role, image slug]  — image files live in heroes/<slug>.webp and heroes/<slug>-tall.webp
window.SYNERGY_HEROES = [
  [1022, "Captain America", "Vanguard", "captain-america"],
  [1018, "Doctor Strange", "Vanguard", "doctor-strange"],
  [1027, "Groot", "Vanguard", "groot"],
  [1011, "Hulk", "Vanguard", "hulk"],
  [1037, "Magneto", "Vanguard", "magneto"],
  [1042, "Peni Parker", "Vanguard", "peni-parker"],
  [1039, "Thor", "Vanguard", "thor"],
  [1035, "Venom", "Vanguard", "venom"],
  [1051, "The Thing", "Vanguard", "the-thing"],
  [1053, "Emma Frost", "Vanguard", "emma-frost"],
  [1056, "Angela", "Vanguard", "angela"],
  [1065, "Rogue", "Vanguard", "rogue"],
  [1062, "Devil Dinosaur", "Vanguard", "devil-dinosaur"],
  [1066, "The Hood", "Vanguard", "the-hood"],
  [1026, "Black Panther", "Duelist", "black-panther"],
  [1033, "Black Widow", "Duelist", "black-widow"],
  [1021, "Hawkeye", "Duelist", "hawkeye"],
  [1024, "Hela", "Duelist", "hela"],
  [1052, "Iron Fist", "Duelist", "iron-fist"],
  [1034, "Iron Man", "Duelist", "iron-man"],
  [1029, "Magik", "Duelist", "magik"],
  [1030, "Moon Knight", "Duelist", "moon-knight"],
  [1045, "Namor", "Duelist", "namor"],
  [1048, "Psylocke", "Duelist", "psylocke"],
  [1038, "Scarlet Witch", "Duelist", "scarlet-witch"],
  [1036, "Spider-Man", "Duelist", "spider-man"],
  [1032, "Squirrel Girl", "Duelist", "squirrel-girl"],
  [1043, "Star-Lord", "Duelist", "star-lord"],
  [1015, "Storm", "Duelist", "storm"],
  [1014, "The Punisher", "Duelist", "the-punisher"],
  [1041, "Winter Soldier", "Duelist", "winter-soldier"],
  [1049, "Wolverine", "Duelist", "wolverine"],
  [1040, "Mister Fantastic", "Duelist", "mister-fantastic"],
  [1017, "Human Torch", "Duelist", "human-torch"],
  [1054, "Phoenix", "Duelist", "phoenix"],
  [1044, "Blade", "Duelist", "blade"],
  [1055, "Daredevil", "Duelist", "daredevil"],
  [1059, "Elsa Bloodstone", "Duelist", "elsa-bloodstone"],
  [1061, "Black Cat", "Duelist", "black-cat"],
  [1063, "Cyclops", "Duelist", "cyclops"],
  [1067, "Gorr", "Duelist", "gorr"],
  [1046, "Adam Warlock", "Strategist", "adam-warlock"],
  [1025, "Cloak & Dagger", "Strategist", "cloak-and-dagger"],
  [1047, "Jeff the Land Shark", "Strategist", "jeff-the-land-shark"],
  [1016, "Loki", "Strategist", "loki"],
  [1031, "Luna Snow", "Strategist", "luna-snow"],
  [1020, "Mantis", "Strategist", "mantis"],
  [1023, "Rocket Raccoon", "Strategist", "rocket-raccoon"],
  [1050, "Invisible Woman", "Strategist", "invisible-woman"],
  [1028, "Ultron", "Strategist", "ultron"],
  [1058, "Gambit", "Strategist", "gambit"],
  [1060, "White Fox", "Strategist", "white-fox"],
  [1064, "Jubilee", "Strategist", "jubilee"],
  [1068, "Nightcrawler", "Strategist", "nightcrawler"],
  [1057, "Deadpool", "Flex", "deadpool"]
];

// Hero order inside each role, matching the game: the launch roster first, then heroes in
// the order they were released. Deadpool plays all three roles, so he's listed in each.
// New heroes not listed here are added at the end of their role automatically.
window.SYNERGY_ROLE_ORDER = {
  Vanguard: [1022, 1018, 1027, 1011, 1037, 1042, 1039, 1035, 1051, 1053, 1056, 1065, 1057, 1062, 1066],
  Duelist: [1026, 1033, 1021, 1024, 1052, 1034, 1029, 1030, 1045, 1048, 1014, 1038, 1036, 1032, 1043, 1015, 1041, 1049, 1040, 1017, 1054, 1044, 1055, 1057, 1059, 1061, 1063, 1067],
  Strategist: [1046, 1025, 1047, 1016, 1031, 1020, 1023, 1050, 1028, 1058, 1057, 1060, 1064, 1068]
};

// Deadpool is one hero in the game but RivalsMeta tracks him per role.
window.SYNERGY_HERO_ALIASES = { 10571: 1057, 10572: 1057, 10573: 1057 };

// Backup team-up list (Season 11 launch, from RivalsMeta). id|NAME|anchor,partner|N(=new)
window.SYNERGY_FALLBACK_TEAMUPS = "1011001|SAVAGE SLAM|1011,1022;1011002|GAMMA FASTBALL|1011,1049;1014001|AMMO OVERLOAD|1014,1023;1014002|BESTIAL HUNT|1014,1055;1015001|GODS OF THUNDER|1015,1039;1015002|JAWS OF FATE|1015,1047;1016001|VIBRANT VITALITY|1016,1020;1016002|VILLAIN'S ILLUSION|1016,1024;1017001|FIERY SPARKS|1017,1064;1017002|STORMING IGNITION|1017,1015;1018001|GAMMA MAELSTROM|1018,1011;1018002|PSIONIC VORTEX|1018,1050;1020001|STAR BLOSSOM|1020,1043;1020002|VITALITY PACT|1020,1046;1021001|MOONLIT SLASH|1021,1025;1021002|SENBONZAKURA STRIKE|1021,1048;1022001|VOLTAIC UNION|1022,1039;1022002|STARS ALIGNED|1022,1041;1023001|PLANET X PALS|1023,1027;1023002|MAMMALIAN BOND|1023,1032;1024001|HEL TENDRILS|1024,1035;1024002|DEEP WRATH|1024,1045;1025001|OBLIVION SHROUD|1025,1066;1025002|FROZEN HAVEN|1025,1031;1026001|DAMISA-YAO|1026,1015;1026002|DIMENSIONAL SHORTCUT|1026,1029;1027001|WILD WALL|1027,1020;1027002|BUBBLE BUDDIES|1027,1047;1028001|STARK PROTOCOL|1028,1034;1028002|SP//DR SYNC|1028,1042;1029001|CHAIN OF CYTTORAK|1029,1018;1029002|VOID PENTAGRAM|1029,1066;1030001|LUMINOUS MOON|1030,1025;1030002|BLOOD MOON|1030,1059;1031001|ATLAS BOND|1031,1060;1031002|DUALITY DANCE|1031,1046;1032001|SQUIRREL MISSILE|1032,1034;1032002|ESU ALUMNUS|1032,1036;1033001|ALLIED AGENTS|1033,1021;1033002|BURNING BULLETS|1033,1054;1034001|GAMMA CHARGE|1034,1011;1034002|THUNDER OVERDRIVE|1034,1039;1035001|BLOOD LEECH|1035,1044;1035002|ABYSSAL FLAMES|1035,1054;1036001|SYMBIOTE BOND|1036,1035;1036002|PARKER POWER-UP|1036,1042;1037001|METALLIC CHAOS|1037,1038;1037002|MAGNETIC RESONANCE|1037,1053;1038001|SORCERERS SUPREME|1038,1018;1038002|HEX FIREWORKS|1038,1064;1039001|RAGNAROK REBIRTH|1039,1024;1039002|DIVINE ARMORY|1039,1056;1040001|FANTASTIC AMPLIFIER|1040,1023;1040002|CLOBBERIN' RESEARCH DEPT.|1040,1051;1041001|TIMELESS VETERANS|1041,1014;1041002|EXPERT INSTINCT|1041,1059;1042001|VIBRANIUM MECH|1042,1026;1042002|ROCKET NETWORK|1042,1023;1043001|FLORA MUNITIONS|1043,1027;1043002|STAR-SOUL|1043,1046;1044001|BLADE OF KHONSHU|1044,1030;1044002|BLEED FOR BATTLE|1044,1022;1045001|CHILLING CHARISMA|1045,1031;1045002|GAMMA MONSTRO|1045,1011;1046001|COSMIC CYCLONE|1046,1015;1046002|FLAWLESS DESIGN|1046,1028;1047001|GUARDIAN OF THE DEEP|1047,1035;1047002|MR. POOL'S INTERDIMENSIONAL TOY BOX|1047,1057;1048001|LIGHT & DARK DARTS|1048,1025;1048002|MENTAL PROJECTION|1048,1053;1049001|BLAST SLASH|1049,1063;1049002|PAIR OF THREES|1049,1058;1050001|UNITED SIBLINGS|1050,1017;1050002|FIRST FAMILY|1050,1040;1051001|TWO-IN-ONE|1051,1017;1051002|UNBREAKABLE FORCES|1051,1050;1052001|KUMIHO PALM|1052,1060;1052002|IRON & STONE|1052,1051;1053001|ICED OUT DIAMOND|1053,1031;1053002|SPIRIT BREAKER|1053,1020;1054001|CIRCLE OF LIFE|1054,1024;1054002|TELEKINETIC BEATDOWN|1054,1065;1055001|COMPREHENSIVE DEFENSE|1055,1052;1055002|DEVILISH AFFAIR|1055,1033;1056001|ODIN'S UNACKNOWLEDGED|1056,1016;1056002|ASGARDIANS OF THE GALAXY|1056,1043;1057001|GUMBO CHIMICHANGAS|1057,1058;1057002|\"HEL-YEAH, HONEY\"|1057,1024;1058001|FAVORABLE ODDS|1058,1037;1058002|SPARKLING STAFF|1058,1064;1059001|PREHISTORIC TRAP|1059,1062;1059002|LOUDMOUTH MERCS|1059,1057;1060001|LUCKY LOAN|1060,1061;1060002|PSIONIC FOX|1060,1048;1061001|FELINE ALLIANCE|1061,1026;1061002|BINDING TIES|1061,1036;1062001|PRIMAL PUNISHMENT|1062,1014;1062002|SURF & TURF|1062,1047;1063001|SLIM AND RED|1063,1054;1063002|KINETIC KIN|1063,1058;1064001|HELLFIRE SPARKS|1064,1066;1064002|VAMPIRIC KIN|1064,1044;1065001|MR. & MRS. X|1065,1058;1065002|EXPLOSIVE ENTANGLEMENT|1065,1037;1066001|CHAOS COLLISION|1066,1038;1066002|NEW MOON'S SHADOW|1066,1030;1067001|RAGNARÖK|1067,1024;1067002|HIVE MIND|1067,1035;1068001|PROTECTIVE SIBLINGS|1068,1065|N;1068002|DEMON DISCIPLE|1068,1029|N";
