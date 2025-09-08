/**
 * Gestionnaire de countdown pour YourMine
 */

class CountdownManager {
    constructor() {
        this.targetDate = new Date(window.YM_CONFIG.COUNTDOWN.TARGET_DATE);
        this.titleElement = document.getElementById('mainTitle');
        this.intervalId = null;
        this.audioElement = document.getElementById('clareAudio');
        
        this.init();
    }

    /**
     * Initialise le countdown et l'audio
     */
    init() {
        this.updateCountdown();
        this.startCountdown();
        this.setupAudio();
    }

    /**
     * Met à jour l'affichage du countdown
     */
    updateCountdown() {
        const currentDate = new Date();
        const timeDifference = this.targetDate - currentDate;
        
        if (timeDifference > 0) {
            // Calculer jours, heures, minutes, secondes
            const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);
            
            // Pour l'instant, on affiche juste "YourMine devnet"
            // Mais on pourrait afficher le countdown si nécessaire
            this.titleElement.textContent = 'YourMine devnet';
        } else {
            this.titleElement.textContent = 'YourMine devnet';
        }
    }

    /**
     * Démarre le countdown avec un intervalle
     */
    startCountdown() {
        // Mettre à jour toutes les secondes
        this.intervalId = setInterval(() => {
            this.updateCountdown();
        }, 1000);
    }

    /**
     * Arrête le countdown
     */
    stopCountdown() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Configure l'audio avec gestion de l'autoplay
     */
    setupAudio() {
        if (!this.audioElement) return;

        const playPromise = this.audioElement.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log('Autoplay blocked, audio will play on first user interaction');
                
                const playOnInteraction = () => {
                    this.audioElement.play().catch(() => {
                        // Ignorer les erreurs si l'audio ne peut pas être joué
                    });
                    document.removeEventListener('click', playOnInteraction);
                    document.removeEventListener('keydown', playOnInteraction);
                };
                
                document.addEventListener('click', playOnInteraction);
                document.addEventListener('keydown', playOnInteraction);
            });
        }
    }

    /**
     * Obtient le temps restant en millisecondes
     */
    getTimeRemaining() {
        const currentDate = new Date();
        return Math.max(0, this.targetDate - currentDate);
    }

    /**
     * Obtient le temps restant formaté
     */
    getFormattedTimeRemaining() {
        const timeDifference = this.getTimeRemaining();
        
        if (timeDifference <= 0) {
            return {
                days: 0,
                hours: 0,
                minutes: 0,
                seconds: 0,
                expired: true
            };
        }

        const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);

        return {
            days,
            hours,
            minutes,
            seconds,
            expired: false
        };
    }

    /**
     * Met à jour la date cible
     */
    updateTargetDate(newDate) {
        this.targetDate = new Date(newDate);
        this.updateCountdown();
    }

    /**
     * Ajoute un callback pour quand le countdown expire
     */
    onExpired(callback) {
        const checkExpired = () => {
            if (this.getTimeRemaining() <= 0) {
                callback();
                this.stopCountdown();
            }
        };

        // Vérifier immédiatement
        checkExpired();

        // Remplacer l'intervalle existant
        this.stopCountdown();
        this.intervalId = setInterval(() => {
            this.updateCountdown();
            checkExpired();
        }, 1000);
    }

    /**
     * Nettoie les ressources
     */
    cleanup() {
        this.stopCountdown();
        
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
    }
}

// Initialiser le countdown au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    window.countdownManager = new CountdownManager();
});

// Exposer la classe globalement
window.CountdownManager = CountdownManager;