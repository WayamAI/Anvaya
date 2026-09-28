import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-display)", "sans-serif"],
        /* Michroma. Wordmark only — see globals.css `.font-brand`. */
        brand: ["var(--font-brand)", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Recessed fill for KPI tiles and read-only insets. */
        sunken: "hsl(var(--surface-sunken))",
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
        },
        "chart-grid": "hsl(var(--chart-grid))",
        "chart-axis": "hsl(var(--chart-axis))",
        "chart-muted": "hsl(var(--chart-muted))",
        "chart-1": "hsl(var(--chart-1))",
        "chart-2": "hsl(var(--chart-2))",
        "chart-3": "hsl(var(--chart-3))",
        "chart-4": "hsl(var(--chart-4))",
        "chart-5": "hsl(var(--chart-5))",
        ebom: {
          DEFAULT: "hsl(var(--ebom))",
          foreground: "hsl(var(--ebom-foreground))",
        },
        mbom: {
          DEFAULT: "hsl(var(--mbom))",
          foreground: "hsl(var(--mbom-foreground))",
        },
        sbom: {
          DEFAULT: "hsl(var(--sbom))",
          foreground: "hsl(var(--sbom-foreground))",
        },
        /* ---- Tier-2 semantic colours (see styles/tokens.css) ------------ */
        page: "var(--surface-page-background)",
        brand: {
          /*
            Channel form, not `var(--accent-default)`.

            Tailwind v3 can only inject an alpha channel into a colour it can
            take apart. Given a plain `var()` it silently drops the modifier —
            `bg-brand/10` came out fully transparent and `ring-brand/30` fell
            back to Tailwind's default blue ring, which is what every focus
            ring in the app was rendering. The triple is the same Wayams
            orange in both themes, so nothing changes for the solid `bg-brand`
            while `/<alpha>` now works everywhere.
          */
          DEFAULT: "rgb(var(--ref-wayam-500-rgb) / <alpha-value>)",
          hover: "var(--accent-hover)",
          active: "var(--accent-active)",
          subtle: "var(--accent-subtle)",
          content: "var(--accent-content)",
          on: "var(--accent-on)",
        },
        container: "var(--surface-container)",
        raised: "var(--surface-raised)",
        "raised-2": "var(--surface-raised-x2)",
        surface: {
          page: "var(--surface-page-background)",
        brand: {
          DEFAULT: "var(--accent-default)",
          hover: "var(--accent-hover)",
          active: "var(--accent-active)",
          subtle: "var(--accent-subtle)",
          content: "var(--accent-content)",
          on: "var(--accent-on)",
        },
          container: "var(--surface-container)",
          raised: "var(--surface-raised)",
          "raised-x2": "var(--surface-raised-x2)",
          action: "var(--surface-action)",
          "scroll-bar": "var(--surface-scroll-bar)",
          /* aliases from the previous generation */
          primary: "var(--surface-primary)",
          secondary: "var(--surface-secondary)",
          tertiary: "var(--surface-tertiary)",
          elevated: "var(--surface-elevated)",
          hover: "var(--surface-hover)",
          active: "var(--surface-active)",
          disabled: "var(--surface-disabled)",
        },
        action: {
          DEFAULT: "var(--surface-action)",
          primary: "var(--action-primary-default)",
          "primary-hover": "var(--action-primary-hover)",
          "primary-focused": "var(--action-primary-focused)",
          "primary-disabled": "var(--action-primary-disabled)",
          "primary-content": "var(--action-primary-content)",
          "primary-text": "var(--action-primary-content)",
          "primary-active": "var(--action-primary-active)",
          secondary: "var(--action-secondary-default)",
          "secondary-hover": "var(--action-secondary-hover)",
          "secondary-focused": "var(--action-secondary-focused)",
          "secondary-disabled": "var(--action-secondary-disabled)",
          "secondary-content": "var(--action-secondary-content)",
          "secondary-text": "var(--action-secondary-content)",
          tertiary: "var(--action-tertiary-default)",
          "tertiary-hover": "var(--action-tertiary-hover)",
          "tertiary-focused": "var(--action-tertiary-focused)",
          disabled: "var(--action-disabled)",
          "disabled-text": "var(--action-disabled-text)",
        },
        stroke: {
          DEFAULT: "var(--stroke-default)",
          active: "var(--stroke-active)",
          muted: "var(--stroke-muted)",
          disabled: "var(--stroke-disabled)",
          "on-color": "var(--stroke-on-color)",
        brand: "var(--accent-default)",
          subtle: "var(--stroke-subtle)",
          strong: "var(--stroke-strong)",
          focus: "var(--stroke-focus)",
        },
        icon: {
          primary: "var(--icon-primary)",
          secondary: "var(--icon-secondary)",
          tertiary: "var(--icon-tertiary)",
          quaternary: "var(--icon-quaternary)",
          "on-color": "var(--icon-on-color)",
          muted: "var(--icon-muted)",
          disabled: "var(--icon-disabled)",
          "on-light": "var(--icon-on-light)",
        },
        feedback: {
          "success-content": "var(--feedback-success-content)",
          "success-icon": "var(--feedback-success-icon)",
          "success-stroke": "var(--feedback-success-stroke)",
          "success-background": "var(--feedback-success-background)",
          "info-content": "var(--feedback-info-content)",
          "info-icon": "var(--feedback-info-icon)",
          "info-stroke": "var(--feedback-info-stroke)",
          "info-background": "var(--feedback-info-background)",
          "neutral-content": "var(--feedback-neutral-content)",
          "neutral-icon": "var(--feedback-neutral-icon)",
          "neutral-stroke": "var(--feedback-neutral-stroke)",
          "neutral-background": "var(--feedback-neutral-background)",
          "warning-content": "var(--feedback-warning-content)",
          "warning-icon": "var(--feedback-warning-icon)",
          "warning-stroke": "var(--feedback-warning-stroke)",
          "warning-background": "var(--feedback-warning-background)",
          "error-content": "var(--feedback-error-content)",
          "error-icon": "var(--feedback-error-icon)",
          "error-stroke": "var(--feedback-error-stroke)",
          "error-background": "var(--feedback-error-background)",
          /* aliases from the previous generation (channel form, alpha-capable) */
          success: "rgb(var(--feedback-success) / <alpha-value>)",
          info: "rgb(var(--feedback-info) / <alpha-value>)",
          warning: "rgb(var(--feedback-warning) / <alpha-value>)",
          critical: "rgb(var(--feedback-critical) / <alpha-value>)",
          highlight: "rgb(var(--feedback-highlight) / <alpha-value>)",
          "success-subtle": "var(--feedback-success-subtle)",
          "info-subtle": "var(--feedback-info-subtle)",
          "warning-subtle": "var(--feedback-warning-subtle)",
          "critical-subtle": "var(--feedback-critical-subtle)",
          "highlight-subtle": "var(--feedback-highlight-subtle)",
        },
        /*
          The four text tones, named for what they are rather than for the
          surface they were first defined on. `foreground` and
          `muted-foreground` are the shadcn names for tiers 1 and 3 and are
          kept for the components that already use them; `ink` gives all four
          tiers one readable scale for everything written since.
        */
        ink: {
          DEFAULT: "hsl(var(--foreground))",
          secondary: "hsl(var(--sidebar-foreground))",
          tertiary: "hsl(var(--muted-foreground))",
          quaternary: "hsl(var(--sidebar-section))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-bg))",
          foreground: "hsl(var(--sidebar-foreground))",
          active: "hsl(var(--sidebar-active))",
          hover: "hsl(var(--sidebar-hover))",
          section: "hsl(var(--sidebar-section))",
          border: "hsl(var(--sidebar-border))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          ring: "hsl(var(--sidebar-ring))",
          background: "hsl(var(--sidebar-background))",
        },
      },
      textColor: {
        /*
          These keys shadow the same-named entries in `colors`, and a flat
          string here replaces the whole object — which silently deletes the
          `-foreground` utility that came with it. `text-muted-foreground`,
          `text-primary-foreground` and their siblings were therefore never
          emitted, and every element using them fell back to inheriting the
          body colour. Restated explicitly so the pairs survive the shadow.
        */
        "primary-foreground": "hsl(var(--primary-foreground))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        "success-foreground": "hsl(var(--success-foreground))",
        "warning-foreground": "hsl(var(--warning-foreground))",

        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        tertiary: "var(--text-tertiary)",
        quaternary: "var(--text-quaternary)",
        "on-color": "var(--text-on-color)",
        brand: "var(--accent-content)",
        success: "var(--feedback-success-content)",
        info: "var(--feedback-info-content)",
        warning: "var(--feedback-warning-content)",
        error: "var(--feedback-error-content)",
        neutral: "var(--feedback-neutral-content)",
        /* aliases from the previous generation */
        muted: "var(--text-muted)",
        disabled: "var(--text-disabled)",
        "on-light": "var(--text-on-light)",
        critical: "var(--feedback-error-content)",
        highlight: "rgb(var(--feedback-highlight) / <alpha-value>)",
      },
      borderColor: {
        DEFAULT: "var(--stroke-default)",
        default: "var(--stroke-default)",
        active: "var(--stroke-active)",
        muted: "var(--stroke-muted)",
        disabled: "var(--stroke-disabled)",
        "on-color": "var(--stroke-on-color)",
        brand: "var(--accent-default)",
        /* aliases from the previous generation */
        subtle: "var(--stroke-muted)",
        strong: "var(--stroke-active)",
        hover: "var(--stroke-active)",
        focus: "var(--stroke-focus)",
      },
      width: {
        "icon-xs": "var(--icon-size-xs)",
        "icon-sm": "var(--icon-size-sm)",
        "icon-md": "var(--icon-size-md)",
        "icon-lg": "var(--icon-size-lg)",
        "icon-xl": "var(--icon-size-xl)",
        "icon-2xl": "var(--icon-size-2xl)",
        "icon-3xl": "var(--icon-size-3xl)",
      },
      height: {
        "icon-xs": "var(--icon-size-xs)",
        "icon-sm": "var(--icon-size-sm)",
        "icon-md": "var(--icon-size-md)",
        "icon-lg": "var(--icon-size-lg)",
        "icon-xl": "var(--icon-size-xl)",
        "icon-2xl": "var(--icon-size-2xl)",
        "icon-3xl": "var(--icon-size-3xl)",
      },
      fontSize: {
        /* -- Display scale (Michroma; page titles and headline figures) */
        "display-6xl": ["64px", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "400" }],
        "display-5xl": ["52px", { lineHeight: "1.08", letterSpacing: "-0.03em", fontWeight: "400" }],
        "display-4xl": ["42px", { lineHeight: "1.1", letterSpacing: "-0.03em", fontWeight: "400" }],
        "display-3xl": ["34px", { lineHeight: "1.12", letterSpacing: "-0.03em", fontWeight: "400" }],
        "display-2xl": ["28px", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "400" }],
        "display-xl": ["22px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "400" }],
        "display-lg": ["18px", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "400" }],
        "display-base": ["14px", { lineHeight: "1.4", letterSpacing: "-0.01em", fontWeight: "400" }],

        /* -- Semantic display roles.
              Set smaller than a Geist page title would be: Michroma runs wide,
              so 28px of it occupies the measure a 34px humanist face would. */
        "display-page": ["28px", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "400" }],
        "metric-xl": ["44px", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "400" }],
        metric: ["28px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "400" }],

        /* -- Geist functional roles */
        "heading-lg": ["24px", { lineHeight: "30px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-md": ["18px", { lineHeight: "24px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "heading-sm": ["16px", { lineHeight: "22px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px", letterSpacing: "-0.01em", fontWeight: "400" }],
        "body-md": ["14px", { lineHeight: "20px", letterSpacing: "-0.01em", fontWeight: "400" }],
        "body-sm": ["12px", { lineHeight: "16px", letterSpacing: "-0.01em", fontWeight: "400" }],
        "label-md": ["14px", { lineHeight: "20px", letterSpacing: "0", fontWeight: "500" }],
        "label-sm": ["12px", { lineHeight: "16px", letterSpacing: "0", fontWeight: "500" }],
        caption: ["12px", { lineHeight: "16px", letterSpacing: "0", fontWeight: "500" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "cc-sm": "var(--cc-radius-sm)",
        "cc-md": "var(--cc-radius-md)",
        "cc-lg": "var(--cc-radius-lg)",
        "cc-xl": "var(--cc-radius-xl)",
      },
      boxShadow: {
        "cc-sm": "var(--cc-shadow-sm)",
        "cc-md": "var(--cc-shadow-md)",
        "cc-panel": "var(--cc-shadow-panel)",
      },
      transitionTimingFunction: {
        cc: "var(--cc-ease)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
