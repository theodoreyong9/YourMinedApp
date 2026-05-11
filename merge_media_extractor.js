// Extrait les URLs médias d'un code HTML de thème
// À intégrer dans merge.js pour auto-remplir media dans themes-files.json

function extractThemeMedia(htmlCode) {
  const photos = [];
  const videos = [];

  // Patterns photo : URLs d'images
  const photoPatterns = [
    /https?:\/\/images\.unsplash\.com\/[^\s'"&)]+/g,
    /https?:\/\/[^\s'"&)]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^\s'"&)]*)?/gi,
    /https?:\/\/pexels\.com\/[^\s'"&)]+/g,
    /https?:\/\/pixabay\.com\/[^\s'"&)]+/g,
  ];

  // Patterns vidéo : URLs de vidéos
  const videoPatterns = [
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[^\s'"&)]+/g,
    /https?:\/\/youtu\.be\/[^\s'"&)]+/g,
    /https?:\/\/(?:www\.)?vimeo\.com\/[^\s'"&)]+/g,
    /https?:\/\/[^\s'"&)]+\.(?:mp4|webm|mov)(?:\?[^\s'"&)]*)?/gi,
  ];

  photoPatterns.forEach(p => {
    const matches = htmlCode.match(p) || [];
    matches.forEach(url => {
      // Filtre les URLs de fonts, scripts, etc.
      if (!url.includes('fonts.') && !url.includes('cdn.') && !photos.includes(url)) {
        photos.push(url);
      }
    });
  });

  videoPatterns.forEach(p => {
    const matches = htmlCode.match(p) || [];
    matches.forEach(url => {
      if (!videos.includes(url)) videos.push(url);
    });
  });

  return {
    photos: [...new Set(photos)],
    videos: [...new Set(videos)],
  };
}

// Usage dans merge.js lors du traitement d'un thème :
// const themeCode = fs.readFileSync('src/themes/mytheme.theme.html', 'utf8');
// const media = extractThemeMedia(themeCode);
// entry.media = media; // puis push dans themes-files.json

module.exports = { extractThemeMedia };
