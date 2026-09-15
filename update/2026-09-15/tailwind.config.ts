import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
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
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			// ВСЕ скругления считаются от одной переменной --radius (src/index.css) — включая xl/2xl/3xl
			// и full, которые раньше брались из значений Tailwind по умолчанию и не реагировали на
			// изменение --radius. Теперь достаточно поменять --radius, чтобы вид всего интерфейса
			// стал строже или мягче: отдельные классы править не нужно.
			borderRadius: {
				none: '0px',
				sm: 'calc(var(--radius) * 0.5)',
				DEFAULT: 'calc(var(--radius) * 0.75)',
				md: 'calc(var(--radius) * 0.85)',
				lg: 'var(--radius)',
				xl: 'calc(var(--radius) * 1.35)',
				'2xl': 'calc(var(--radius) * 1.8)',
				'3xl': 'calc(var(--radius) * 2.4)',
				full: '9999px'
			},
			// Тени премиальной тёмной темы. Стандартные тени Tailwind рассчитаны на СВЕТЛЫЙ фон:
			// на тёмном они дают резкий чёрный ореол вокруг элемента. Здесь — глубокое размытие,
			// низкая непрозрачность и лёгкая подсветка верхней грани (inset сверху), из-за которой
			// карточка выглядит объёмной, а не наклеенной.
			boxShadow: {
				sm: '0 1px 2px 0 hsl(222 30% 2% / 0.30)',
				DEFAULT: '0 2px 6px -1px hsl(222 30% 2% / 0.35)',
				md: '0 6px 16px -4px hsl(222 30% 2% / 0.40)',
				lg: '0 12px 32px -8px hsl(222 30% 2% / 0.50), 0 2px 8px -2px hsl(222 30% 2% / 0.30)',
				xl: '0 24px 56px -16px hsl(222 30% 2% / 0.60), 0 4px 12px -4px hsl(222 30% 2% / 0.35)',
				'2xl': '0 32px 72px -20px hsl(222 30% 2% / 0.70)',
				// Для карточек: тончайшая светлая грань сверху — имитация падающего света.
				raised: '0 1px 0 0 hsl(210 40% 100% / 0.04) inset, 0 2px 8px -2px hsl(222 30% 2% / 0.35)',
				// Акцентные элементы (активная вкладка, главная кнопка): светлая грань сверху внутри
				// + мягкое ЦВЕТНОЕ свечение наружу. Именно свечение читается как «дорогая» подсветка,
				// а не плоская заливка — цвет при этом остаётся тем же, меняется только подача.
				accent: '0 1px 0 0 hsl(45 100% 80% / 0.35) inset, 0 0 0 1px hsl(38 85% 50% / 0.25), 0 6px 20px -8px hsl(38 85% 50% / 0.45)',
				'accent-hover': '0 1px 0 0 hsl(45 100% 80% / 0.45) inset, 0 0 0 1px hsl(38 85% 52% / 0.35), 0 10px 28px -8px hsl(38 85% 50% / 0.55)',
				none: 'none'
			},
			// Единая кривая движения для всего интерфейса. Дефолтный ease в браузере линеен на
			// выходе и читается «дёшево»; эта кривая тормозит мягко, как физическая инерция.
			transitionTimingFunction: {
				premium: 'cubic-bezier(.32,.72,0,1)'
			},
			transitionDuration: {
				premium: '200ms'
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
				},
				'fade-in': {
					from: { opacity: '0', transform: 'translateY(8px)' },
					to: { opacity: '1', transform: 'translateY(0)' }
				},
				'scale-in': {
					from: { opacity: '0', transform: 'scale(0.97)' },
					to: { opacity: '1', transform: 'scale(1)' }
				},
				'pulse-dot': {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0.4' }
				},
				// Очень медленный дрейф фоновых засветок. Период 60 c и амплитуда в единицы процентов:
				// заметить движение нельзя, но сцена перестаёт быть «мёртвой картинкой».
				'ambient-drift': {
					'0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
					'50%': { transform: 'translate3d(-2%, 1.5%, 0) scale(1.06)' }
				},
				// Пробег блика по скелетону — вместо бесконечной крутилки.
				shimmer: {
					'100%': { transform: 'translateX(100%)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				// Появление — по общей премиальной кривой, а не дефолтным ease-out.
				'fade-in': 'fade-in 0.4s cubic-bezier(.32,.72,0,1) both',
				'scale-in': 'scale-in 0.26s cubic-bezier(.32,.72,0,1) both',
				'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
				'ambient-drift': 'ambient-drift 60s ease-in-out infinite',
				shimmer: 'shimmer 1.6s cubic-bezier(.32,.72,0,1) infinite'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;