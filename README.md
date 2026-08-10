# Fastbar

Build a minimal bar tab app focused on a digital comanda MVP for a small bar.

Core flow:

- Customer scans a QR code that opens a web page.
- Customer enters full name and cellphone to create a tab/session.
- No Google login for now.
- No self-ordering/PWA ordering yet; only the digital tab.
- Staff uses the computer to add drinks/items to the customer’s tab.
- The customer can view their live tab on their phone.

Required data model and timestamps:

- Session start timestamp when the tab is opened.
- Timestamp for every line item added to the tab.
- Closed timestamp when the tab is paid/closed.
- Show elapsed time / time in venue based on start and closed timestamps.

UI:

- Customer page: name, cellphone, tab status, list of items, running total, started at, elapsed time.
- Staff page: open tabs list, search by name/cellphone, open tab detail, add predefined beverage items, close tab, mark as paid.
- Keep the interface very simple, mobile-friendly, and fast.

Important:

- Use a clean, minimal layout.
- Focus on the simplest possible MVP that can be used by a small bar.
- Do not build payment processing yet unless it is trivial to stub as a close-tab action.
- Make the terminology Portuguese-friendly where reasonable, but keep code in English.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fastbar.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1b70fc84-37a2-45c9-9d88-01dab70e8114).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
