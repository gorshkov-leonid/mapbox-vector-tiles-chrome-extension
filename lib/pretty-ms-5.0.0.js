(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global = global || self, global.prettyMilliseconds = factory());
}(this, function () { 'use strict';

	var parseMs = milliseconds => {
		if (typeof milliseconds !== 'number') {
			throw new TypeError('Expected a number');
		}

		const roundTowardsZero = milliseconds > 0 ? Math.floor : Math.ceil;

		return {
			days: roundTowardsZero(milliseconds / 86400000),
			hours: roundTowardsZero(milliseconds / 3600000) % 24,
			minutes: roundTowardsZero(milliseconds / 60000) % 60,
			seconds: roundTowardsZero(milliseconds / 1000) % 60,
			milliseconds: roundTowardsZero(milliseconds) % 1000,
			microseconds: roundTowardsZero(milliseconds * 1000) % 1000,
			nanoseconds: roundTowardsZero(milliseconds * 1e6) % 1000
		};
	};

	const pluralize = (word, count) => count === 1 ? word : word + 's';

	var _package = (milliseconds, options = {}) => {
		if (!Number.isFinite(milliseconds)) {
			throw new TypeError('Expected a finite number');
		}

		if (options.compact) {
			options.secondsDecimalDigits = 0;
			options.millisecondsDecimalDigits = 0;
		}

		const result = [];

		const add = (value, long, short, valueString) => {
			if (value === 0) {
				return;
			}

			const postfix = options.verbose ? ' ' + pluralize(long, value) : short;

			result.push((valueString || value) + postfix);
		};

		const secondsDecimalDigits =
			typeof options.secondsDecimalDigits === 'number' ?
				options.secondsDecimalDigits :
				1;

		if (secondsDecimalDigits < 1) {
			const difference = 1000 - (milliseconds % 1000);
			if (difference < 500) {
				milliseconds += difference;
			}
		}

		const parsed = parseMs(milliseconds);

		add(Math.trunc(parsed.days / 365), 'year', 'y');
		add(parsed.days % 365, 'day', 'd');
		add(parsed.hours, 'hour', 'h');
		add(parsed.minutes, 'minute', 'm');

		if (
			options.separateMilliseconds ||
			options.formatSubMilliseconds ||
			milliseconds < 1000
		) {
			add(parsed.seconds, 'second', 's');
			if (options.formatSubMilliseconds) {
				add(parsed.milliseconds, 'millisecond', 'ms');
				add(parsed.microseconds, 'microsecond', 'µs');
				add(parsed.nanoseconds, 'nanosecond', 'ns');
			} else {
				const millisecondsAndBelow =
					parsed.milliseconds +
					(parsed.microseconds / 1000) +
					(parsed.nanoseconds / 1e6);

				const millisecondsDecimalDigits =
					typeof options.millisecondsDecimalDigits === 'number' ?
						options.millisecondsDecimalDigits :
						0;

				const millisecondsString = millisecondsDecimalDigits ?
					millisecondsAndBelow.toFixed(millisecondsDecimalDigits) :
					Math.ceil(millisecondsAndBelow);

				add(
					parseFloat(millisecondsString, 10),
					'millisecond',
					'ms',
					millisecondsString
				);
			}
		} else {
			const seconds = (milliseconds / 1000) % 60;
			const secondsDecimalDigits =
				typeof options.secondsDecimalDigits === 'number' ?
					options.secondsDecimalDigits :
					1;
			const secondsFixed = seconds.toFixed(secondsDecimalDigits);
			const secondsString = options.keepDecimalsOnWholeSeconds ?
				secondsFixed :
				secondsFixed.replace(/\.0+$/, '');
			add(parseFloat(secondsString, 10), 'second', 's', secondsString);
		}

		if (result.length === 0) {
			return '0' + (options.verbose ? ' milliseconds' : 'ms');
		}

		if (options.compact) {
			return '~' + result[0];
		}

		if (typeof options.unitCount === 'number') {
			return '~' + result.slice(0, Math.max(options.unitCount, 1)).join(' ');
		}

		return result.join(' ');
	};

	return _package;

}));
