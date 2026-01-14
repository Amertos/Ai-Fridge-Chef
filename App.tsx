import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, AlertCircle, Tag, Filter, Clock, ChefHat, Heart, BookOpen, Code, ArrowUpDown } from 'lucide-react';
import { AppState, AIResponse, Recept } from './types';
import { analyzeFridgeImage, generateRecipesFromIngredients } from './services/geminiService';

import Hero from './components/Hero';
import ImageUploader from './components/ImageUploader';
import LoadingState from './components/LoadingState';
import RecipeCard from './components/RecipeCard';
import CookingMode from './components/CookingMode';

// Helper to parse time string to minutes
const parseCookingTime = (timeStr: string): number => {
  const lower = timeStr.toLowerCase();
  let minutes = 0;
  
  // Check for hours
  const hoursMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:sat|h)/);
  if (hoursMatch) {
    minutes += parseFloat(hoursMatch[1]) * 60;
  }
  
  // Check for minutes
  const minsMatch = lower.match(/(\d+)\s*min/);
  if (minsMatch) {
    minutes += parseInt(minsMatch[1]);
  }

  // Fallback: if only number is present, assume minutes
  if (minutes === 0) {
    const justNumber = lower.match(/(\d+)/);
    if (justNumber) {
       minutes = parseInt(justNumber[1]);
    } else {
      return 999; // Unknown time
    }
  }
  
  return minutes;
};

// Orchestration variants for staggered animation
const gridContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15, // Delay between each child animation
      delayChildren: 0.1 // Initial delay before starting
    }
  }
};

type SortOption = 'default' | 'time_asc' | 'time_desc' | 'name_asc' | 'name_desc';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('hero');
  const [imageData, setImageData] = useState<string | null>(null);
  const [aiData, setAiData] = useState<AIResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Selected recipe for cooking mode
  const [cookingRecipe, setCookingRecipe] = useState<Recept | null>(null);

  // Favorites State
  const [favorites, setFavorites] = useState<Recept[]>(() => {
    try {
      const stored = localStorage.getItem('ai-fridge-chef-favorites');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error("Failed to load favorites", e);
      return [];
    }
  });

  // Filter & Sort states
  const [difficultyFilter, setDifficultyFilter] = useState<'Sve' | 'Lako' | 'Srednje' | 'Teško'>('Sve');
  const [timeFilter, setTimeFilter] = useState<'Sve' | 'do_30' | 'do_60'>('Sve');
  const [sortBy, setSortBy] = useState<SortOption>('default');

  // Logic to toggle favorites
  const toggleFavorite = (recipe: Recept) => {
    setFavorites(prev => {
      const exists = prev.some(r => r.naslov === recipe.naslov);
      let newFavorites;
      if (exists) {
        newFavorites = prev.filter(r => r.naslov !== recipe.naslov);
      } else {
        newFavorites = [...prev, recipe];
      }
      localStorage.setItem('ai-fridge-chef-favorites', JSON.stringify(newFavorites));
      return newFavorites;
    });
  };

  const isFavorite = (recipe: Recept) => {
    return favorites.some(r => r.naslov === recipe.naslov);
  };

  const handleStart = () => setAppState('upload');
  const handleOpenFavorites = () => setAppState('favorites');

  const handleStartCooking = (recipe: Recept) => {
    setCookingRecipe(recipe);
    setAppState('cooking');
  };

  const handleImageSelected = async (base64: string) => {
    setImageData(base64);
    setAppState('analyzing');
    setErrorMsg(null);

    try {
      const data = await analyzeFridgeImage(base64);
      setAiData(data);
      setAppState('results');
      setDifficultyFilter('Sve');
      setTimeFilter('Sve');
      setSortBy('default');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Došlo je do greške prilikom analize slike.');
      setAppState('error');
    }
  };

  const handleTextSubmit = async (ingredients: string) => {
    setImageData(null); // No image in text mode
    setAppState('analyzing');
    setErrorMsg(null);

    try {
      const data = await generateRecipesFromIngredients(ingredients);
      setAiData(data);
      setAppState('results');
      setDifficultyFilter('Sve');
      setTimeFilter('Sve');
      setSortBy('default');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Došlo je do greške prilikom generisanja recepata.');
      setAppState('error');
    }
  };

  const resetApp = () => {
    setAppState('hero');
    setImageData(null);
    setAiData(null);
    setErrorMsg(null);
    setCookingRecipe(null);
  };

  const tryAgain = () => {
    setAppState('upload');
    setErrorMsg(null);
  };

  const closeCookingMode = () => {
    // If we came from favorites, go back to favorites, else results
    if (aiData) {
      setAppState('results');
    } else {
      setAppState('favorites');
    }
    setCookingRecipe(null);
  };

  // Filtered recipes calculation (for results view)
  const filteredRecipes = useMemo(() => {
    if (!aiData) return [];
    
    // 1. Filter
    let result = aiData.recepti.filter(recipe => {
      // Difficulty filter
      if (difficultyFilter !== 'Sve' && recipe.tezina !== difficultyFilter) {
        return false;
      }

      // Time filter
      if (timeFilter !== 'Sve') {
        const minutes = parseCookingTime(recipe.vreme);
        if (timeFilter === 'do_30' && minutes > 30) return false;
        if (timeFilter === 'do_60' && minutes > 60) return false;
      }

      return true;
    });

    // 2. Sort
    if (sortBy !== 'default') {
      result = [...result].sort((a, b) => {
        if (sortBy === 'time_asc') {
          return parseCookingTime(a.vreme) - parseCookingTime(b.vreme);
        } else if (sortBy === 'time_desc') {
          return parseCookingTime(b.vreme) - parseCookingTime(a.vreme);
        } else if (sortBy === 'name_asc') {
          return a.naslov.localeCompare(b.naslov);
        } else if (sortBy === 'name_desc') {
          return b.naslov.localeCompare(a.naslov);
        }
        return 0;
      });
    }

    return result;
  }, [aiData, difficultyFilter, timeFilter, sortBy]);

  // Only show signature on screens where it doesn't obstruct UI
  const showSignature = appState !== 'cooking' && appState !== 'upload';

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans relative">
      <AnimatePresence mode="wait">
        {appState === 'hero' && (
          <Hero key="hero" onStart={handleStart} onOpenFavorites={handleOpenFavorites} />
        )}

        {appState === 'upload' && (
          <ImageUploader 
            key="upload" 
            onImageSelected={handleImageSelected} 
            onTextSubmit={handleTextSubmit}
            onCancel={() => setAppState('hero')} 
          />
        )}

        {appState === 'analyzing' && (
          <LoadingState key="loading" />
        )}

        {appState === 'cooking' && cookingRecipe && (
           <CookingMode 
             key="cooking" 
             recipe={cookingRecipe} 
             onClose={closeCookingMode} 
           />
        )}

        {appState === 'results' && aiData && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-white"
          >
            {/* Header */}
            <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-neutral-100 px-4 md:px-6 py-4 flex items-center justify-between">
              <button 
                onClick={resetApp}
                className="flex items-center gap-2 text-neutral-500 hover:text-orange-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Početna</span>
              </button>
              <h1 className="text-lg md:text-xl font-bold text-neutral-800">AI Fridge Chef</h1>
              <div className="flex gap-2">
                <button 
                  onClick={handleOpenFavorites}
                  className="p-2 bg-neutral-50 text-neutral-600 rounded-full hover:bg-neutral-100 hover:text-red-500 transition-colors"
                  title="Omiljeni recepti"
                >
                  <Heart className="w-5 h-5" />
                </button>
                <button 
                  onClick={resetApp}
                  className="p-2 bg-orange-50 text-orange-600 rounded-full hover:bg-orange-100 transition-colors"
                  title="Nova analiza"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 pb-24 md:pb-12">
              {/* Detected Ingredients Section */}
              <section className="mb-10">
                <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  {imageData ? 'Prepoznate namirnice' : 'Unesene namirnice'}
                </h2>
                <div className="flex flex-wrap gap-2 md:gap-3">
                  {aiData.detektovane_namirnice.map((item, index) => (
                    <motion.span
                      key={index}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="px-3 py-1.5 md:px-4 md:py-2 bg-neutral-100 text-neutral-700 rounded-full text-xs md:text-sm font-medium hover:bg-orange-100 hover:text-orange-700 transition-colors cursor-default"
                    >
                      {item}
                    </motion.span>
                  ))}
                </div>
              </section>

              {/* Filters Section */}
              <section className="mb-8">
                 <div className="flex flex-col md:flex-row gap-6 md:items-center p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                    
                    {/* Difficulty Filters */}
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-neutral-400 uppercase flex items-center gap-1">
                        <ChefHat className="w-3 h-3" /> Težina
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(['Sve', 'Lako', 'Srednje', 'Teško'] as const).map((level) => (
                          <button
                            key={level}
                            onClick={() => setDifficultyFilter(level)}
                            className={`px-3 py-1.5 md:px-4 rounded-full text-xs md:text-sm font-medium transition-all ${
                              difficultyFilter === level
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                                : 'bg-white text-neutral-600 hover:bg-neutral-200 border border-neutral-200'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="hidden md:block w-px h-12 bg-neutral-200"></div>

                    {/* Time Filters */}
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-bold text-neutral-400 uppercase flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Vreme pripreme
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button
                           onClick={() => setTimeFilter('Sve')}
                           className={`px-3 py-1.5 md:px-4 rounded-full text-xs md:text-sm font-medium transition-all ${
                             timeFilter === 'Sve'
                               ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                               : 'bg-white text-neutral-600 hover:bg-neutral-200 border border-neutral-200'
                           }`}
                        >
                          Sve
                        </button>
                        <button
                           onClick={() => setTimeFilter('do_30')}
                           className={`px-3 py-1.5 md:px-4 rounded-full text-xs md:text-sm font-medium transition-all ${
                             timeFilter === 'do_30'
                               ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                               : 'bg-white text-neutral-600 hover:bg-neutral-200 border border-neutral-200'
                           }`}
                        >
                          &lt; 30 min
                        </button>
                        <button
                           onClick={() => setTimeFilter('do_60')}
                           className={`px-3 py-1.5 md:px-4 rounded-full text-xs md:text-sm font-medium transition-all ${
                             timeFilter === 'do_60'
                               ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                               : 'bg-white text-neutral-600 hover:bg-neutral-200 border border-neutral-200'
                           }`}
                        >
                          &lt; 60 min
                        </button>
                      </div>
                    </div>

                 </div>
              </section>

              {/* Recipes Grid */}
              <section>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <h2 className="text-xl md:text-2xl font-bold text-neutral-800">
                    Preporučeni recepti
                  </h2>
                  
                  <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto">
                    <span className="text-sm text-neutral-500 font-medium whitespace-nowrap">
                      {filteredRecipes.length} {filteredRecipes.length === 1 ? 'recept' : 'recepata'}
                    </span>
                    
                    {/* Sorting Dropdown */}
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <ArrowUpDown className="h-4 w-4 text-neutral-400" />
                      </div>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="appearance-none bg-white border border-neutral-200 text-neutral-700 text-sm rounded-xl pl-10 pr-8 py-2 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none cursor-pointer hover:border-orange-300 transition-colors"
                      >
                        <option value="default">Preporučeno</option>
                        <option value="time_asc">Najbrže prvo</option>
                        <option value="time_desc">Najsporije prvo</option>
                        <option value="name_asc">Naziv (A-Z)</option>
                        <option value="name_desc">Naziv (Z-A)</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-neutral-400">
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                </div>

                {filteredRecipes.length > 0 ? (
                  <motion.div 
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    variants={gridContainerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {filteredRecipes.map((recept, index) => (
                      <RecipeCard 
                        key={`${recept.naslov}-${index}`} 
                        recipe={recept} 
                        index={index} 
                        isFavorite={isFavorite(recept)}
                        onToggleFavorite={() => toggleFavorite(recept)}
                        onStartCooking={() => handleStartCooking(recept)}
                      />
                    ))}
                  </motion.div>
                ) : (
                  <div className="text-center py-20 bg-neutral-50 rounded-3xl border-2 border-dashed border-neutral-200">
                    <Filter className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
                    <p className="text-neutral-500 font-medium">
                      Nema recepata koji odgovaraju izabranim filterima.
                    </p>
                    <button 
                      onClick={() => { setDifficultyFilter('Sve'); setTimeFilter('Sve'); setSortBy('default'); }}
                      className="mt-4 text-orange-600 font-semibold hover:underline"
                    >
                      Poništi filtere
                    </button>
                  </div>
                )}
              </section>
            </main>
          </motion.div>
        )}

        {appState === 'favorites' && (
          <motion.div
            key="favorites"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="min-h-screen bg-white"
          >
             <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-neutral-100 px-4 md:px-6 py-4 flex items-center justify-between">
              <button 
                onClick={resetApp}
                className="flex items-center gap-2 text-neutral-500 hover:text-orange-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="hidden sm:inline">Nazad na početnu</span>
              </button>
              <h1 className="text-lg md:text-xl font-bold text-neutral-800">Omiljeni recepti</h1>
              <div className="w-9"></div> {/* Spacer for alignment */}
            </header>

            <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 pb-24 md:pb-12">
              {favorites.length > 0 ? (
                <motion.div 
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    variants={gridContainerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {favorites.map((recept, index) => (
                      <RecipeCard 
                        key={`fav-${recept.naslov}-${index}`} 
                        recipe={recept} 
                        index={index} 
                        isFavorite={true}
                        onToggleFavorite={() => toggleFavorite(recept)}
                        onStartCooking={() => handleStartCooking(recept)}
                      />
                    ))}
                  </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-neutral-100 text-neutral-300 rounded-full flex items-center justify-center mb-6">
                    <BookOpen className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-neutral-800 mb-2">Još uvek nema omiljenih</h3>
                  <p className="text-neutral-500 max-w-sm mb-8">
                    Sačuvajte recepte koji vam se dopadaju klikom na srce kako biste im kasnije lako pristupili.
                  </p>
                  <button
                    onClick={handleStart}
                    className="px-6 py-3 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors font-medium shadow-lg shadow-orange-500/20"
                  >
                    Pronađi nove recepte
                  </button>
                </div>
              )}
            </main>
          </motion.div>
        )}

        {appState === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-screen p-6 text-center"
          >
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-neutral-800 mb-2">Ups, nešto je pošlo po zlu</h3>
            <p className="text-neutral-600 mb-8 max-w-md">
              {errorMsg}
            </p>
            <button
              onClick={tryAgain}
              className="px-8 py-3 bg-neutral-900 text-white rounded-full hover:bg-neutral-800 transition-colors font-medium"
            >
              Pokušaj ponovo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Professional Developer Signature Badge */}
      <AnimatePresence>
        {showSignature && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 z-40"
          >
            <div className="flex items-center gap-3 px-4 py-2 bg-neutral-900/90 backdrop-blur-md text-white rounded-full shadow-lg border border-neutral-800/50 hover:bg-black transition-colors cursor-default group">
               <div className="relative">
                 <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                 <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
               </div>
               <div className="flex items-center gap-2">
                 <Code className="w-4 h-4 text-neutral-400 group-hover:text-orange-500 transition-colors" />
                 <span className="text-xs font-mono text-neutral-400">
                   Dev: <span className="text-white font-bold tracking-wide group-hover:text-orange-400 transition-colors">Amer Biberović</span>
                 </span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;