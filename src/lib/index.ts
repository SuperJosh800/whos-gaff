// place files you want to import through the `#lib` alias in this folder.

/** The site a link goes to, such as "maps.app.goo.gl", so people can see where it leads before tapping. */
export function linkHost(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return 'Link';
	}
}
