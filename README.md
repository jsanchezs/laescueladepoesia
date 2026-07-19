# La Escuela de Poesía

Web estática de La Escuela de Poesía de Miguel Sánchez Santamaría.

## Desarrollo

```bash
pnpm install
pnpm dev
```

La primera landing está disponible en `/courses/intermediate-tuesday/`.

## Comandos

| Comando | Acción |
| --- | --- |
| `pnpm dev` | Inicia el servidor local |
| `pnpm check` | Valida Astro y TypeScript |
| `pnpm build` | Genera la web estática en `dist/` |
| `pnpm preview` | Previsualiza el build de producción |

Los datos de cada curso viven en `src/content/courses/` y las páginas se generan mediante la ruta dinámica `src/pages/courses/[slug].astro`.

## Despliegue

La web se publica automáticamente en GitHub Pages cuando se fusionan cambios en `main`:

`https://jsanchezs.github.io/laescueladepoesia/`

El repositorio debe tener seleccionada la opción **Settings → Pages → Source → GitHub Actions**.
