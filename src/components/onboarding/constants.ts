export interface TopicCategory {
  name: string;
  topics: string[];
}

export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    name: "Gaming",
    topics: [
      "Gaming", "Minecraft", "Fortnite", "GTA", "Call of Duty",
      "Valorant", "League of Legends", "Pokemon", "Nintendo",
      "PlayStation", "Xbox", "PC Gaming", "Esports", "Speedruns",
      "Game Reviews", "Indie Games", "Retro Gaming", "Mobile Games",
      "Roblox", "Apex Legends", "FIFA"
    ]
  },
  {
    name: "Music",
    topics: [
      "Music", "Pop Music", "Hip Hop", "R&B", "Rock", "Metal",
      "Jazz", "Classical", "Electronic", "EDM", "Lo-Fi", "K-Pop",
      "J-Pop", "Country", "Indie Music", "Music Production",
      "Guitar", "Piano", "Singing", "Music Theory", "Album Reviews",
      "Concerts", "DJ"
    ]
  },
  {
    name: "Technology",
    topics: [
      "Technology", "Programming", "Coding", "Web Development",
      "App Development", "AI", "Machine Learning", "Cybersecurity",
      "Linux", "Apple", "Android", "Smartphones", "Laptops",
      "PC Building", "Tech Reviews", "Gadgets", "Software",
      "Cloud Computing", "Blockchain", "Crypto", "Startups"
    ]
  },
  {
    name: "Entertainment",
    topics: [
      "Movies", "TV Shows", "Netflix", "Anime", "Marvel", "DC",
      "Star Wars", "Disney", "Comedy", "Stand-up Comedy", "Drama",
      "Horror", "Sci-Fi", "Documentary", "Film Analysis",
      "Movie Reviews", "Behind the Scenes", "Celebrities",
      "Award Shows", "Trailers", "Fan Theories"
    ]
  },
  {
    name: "Education",
    topics: [
      "Science", "Physics", "Chemistry", "Biology", "Mathematics",
      "History", "Geography", "Psychology", "Philosophy",
      "Economics", "Finance", "Investing", "Business", "Marketing",
      "Language Learning", "English", "Spanish", "Study Tips",
      "College", "University", "Tutorials"
    ]
  },
  {
    name: "Health & Fitness",
    topics: [
      "Fitness", "Workout", "Gym", "Yoga", "Running", "CrossFit",
      "Bodybuilding", "Weight Loss", "Nutrition", "Healthy Eating",
      "Mental Health", "Meditation", "Self Improvement",
      "Productivity", "Motivation", "Sports", "Basketball",
      "Football", "Soccer", "MMA", "Boxing", "Tennis", "Golf"
    ]
  },
  {
    name: "Lifestyle",
    topics: [
      "Cooking", "Recipes", "Baking", "Food", "Restaurants",
      "Travel", "Vlogging", "Daily Vlog", "Fashion", "Style",
      "Beauty", "Skincare", "Home Decor", "Interior Design", "DIY",
      "Crafts", "Gardening", "Pets", "Dogs", "Cats", "Cars",
      "Motorcycles", "Photography"
    ]
  },
  {
    name: "Creative",
    topics: [
      "Art", "Drawing", "Painting", "Digital Art", "Animation",
      "3D Modeling", "Graphic Design", "Video Editing", "Filmmaking",
      "Photography", "Music Production", "Writing", "Storytelling",
      "Architecture", "Fashion Design", "Crafts", "Woodworking",
      "Sculpture"
    ]
  },
  {
    name: "Science & Nature",
    topics: [
      "Space", "Astronomy", "NASA", "Physics", "Nature", "Animals",
      "Wildlife", "Ocean", "Marine Life", "Environment", "Climate",
      "Geology", "Paleontology", "Dinosaurs", "Engineering",
      "Inventions", "Experiments"
    ]
  },
  {
    name: "News & Current Events",
    topics: [
      "News", "Politics", "World News", "Tech News", "Sports News",
      "Entertainment News", "Business News", "Analysis",
      "Commentary", "Podcasts", "Interviews", "Debates",
      "Current Events"
    ]
  }
];

export interface CuratedChannel {
  id: string;
  name: string;
  avatar: string;
  subscribers: string;
  category: string;
}

export const CURATED_CHANNELS: CuratedChannel[] = [
  // Technology
  { id: "UCsBjURrdU234nU351gVEfTA", name: "Fireship", avatar: "FS", subscribers: "3.2M", category: "Technology" },
  { id: "UCBJycsmduvYELgTKEgUMt2g", name: "MKBHD", avatar: "MK", subscribers: "19M", category: "Technology" },
  { id: "UCwRxwjk_c_92sAMeX4JzW4w", name: "Linus Tech Tips", avatar: "LT", subscribers: "15.6M", category: "Technology" },
  
  // Music
  { id: "UCSJ4gkVC6NrvII8umztf0Ow", name: "Lofi Girl", avatar: "LG", subscribers: "14.3M", category: "Music" },
  { id: "UC-51_T6T74a3_Kz9oI3W07g", name: "Cercle", avatar: "CC", subscribers: "3.1M", category: "Music" },

  // Education & Science
  { id: "UCsXVk37bltHxD1rDPwtNM8Q", name: "Kurzgesagt – In a Nutshell", avatar: "KZ", subscribers: "22.4M", category: "Education" },
  { id: "UCsXVk37bltHxD1rDPwtNM8R", name: "Vsauce", avatar: "VS", subscribers: "18.2M", category: "Education" },
  { id: "UCsXVk37bltHxD1rDPwtNM8S", name: "Veritasium", avatar: "VT", subscribers: "15.1M", category: "Education" },

  // Gaming
  { id: "UC-lHJZR3Gqxm24_Vd_AJ5Yw", name: "PewDiePie", avatar: "PD", subscribers: "111M", category: "Gaming" },
  { id: "UCsXVk37bltHxD1rDPwtNM8T", name: "Markiplier", avatar: "MP", subscribers: "36.5M", category: "Gaming" },
];
