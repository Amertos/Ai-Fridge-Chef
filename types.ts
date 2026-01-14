export interface NutritivneVrednosti {
  kalorije: string;
  proteini: string;
  ugljeni_hidrati: string;
  masti: string;
}

export interface Recept {
  naslov: string;
  vreme: string;
  tezina: 'Lako' | 'Srednje' | 'Teško';
  sastojci: string[];
  uputstvo: string[];
  nutritivne_vrednosti: NutritivneVrednosti;
  slika_prompt: string; // New field for AI image generation
}

export interface AIResponse {
  detektovane_namirnice: string[];
  recepti: Recept[];
}

export type AppState = 'hero' | 'upload' | 'analyzing' | 'results' | 'favorites' | 'error' | 'cooking';