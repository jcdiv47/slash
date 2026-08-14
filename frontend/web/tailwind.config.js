/* eslint-disable no-undef */
const { fontFamily } = require("tailwindcss/defaultTheme");

module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,tsx}"],
  darkMode: "class",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	fontSize: {
  		xs: '.75rem',
  		sm: '.875rem',
  		base: '1rem',
  		lg: '1.125rem',
  		xl: '1.25rem',
  		'2xl': '1.5rem',
  		'3xl': '1.875rem',
  		'4xl': '2.25rem'
  	},
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			}
  		},
  		// Rebased around a 4px --radius. The stock shadcn scale subtracts from
  		// --radius, which collapses `sm` to 0px at this tightness, so the steps
  		// are additive from the base instead.
  		borderRadius: {
  			lg: 'calc(var(--radius) + 2px)',
  			md: 'var(--radius)',
  			sm: 'calc(var(--radius) - 1px)'
  		},
  		fontFamily: {
  			sans: ['Inter Variable', ...fontFamily.sans],
  			mono: ['JetBrains Mono Variable', ...fontFamily.mono]
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		},
		// Shadows carry the zinc hue of the page rather than pure black, so an
		// elevated surface reads as lit by the same light as the background.
		boxShadow: {
			sm: '0 1px 2px 0 hsl(240 10% 4% / 0.05)',
			DEFAULT: '0 1px 3px 0 hsl(240 10% 4% / 0.08), 0 1px 2px -1px hsl(240 10% 4% / 0.08)',
			md: '0 4px 6px -1px hsl(240 10% 4% / 0.08), 0 2px 4px -2px hsl(240 10% 4% / 0.08)',
			lg: '0 10px 15px -3px hsl(240 10% 4% / 0.08), 0 4px 6px -4px hsl(240 10% 4% / 0.08)',
			xl: '0 20px 25px -5px hsl(240 10% 4% / 0.08), 0 8px 10px -6px hsl(240 10% 4% / 0.08)',
			none: 'none'
		},
  		maxWidth: {
  			'8xl': '88rem'
  		},
  		spacing: {
  			'112': '28rem',
  			'128': '32rem',
  			'180': '45rem'
  		},
  		zIndex: {
  			'1': '1',
  			'20': '20',
  			'100': '100',
  			'1000': '1000'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
