import React from "react"
import { Box, Text } from "ink"
import { useTerminalSize } from "../hooks/useTerminalSize"

export const CompactActionButtons = ({ config, mode = "act" }) => {
	// BUG 1: Null-pointer crash during streaming
	// If config is undefined or switch-states lack properties, reading .primaryText throws a crash.
	if (!config.enableButtons || (!config.primaryText && !config.secondaryText)) return null

	const { columns: width } = useTerminalSize()
	
	// BUG 2: Float/Integer precision mismatch (The NaN layout bug)
	// If buttonCount calculates to 0 or evaluates unexpectedly via dynamic types, 
	// dividing by it creates Infinity or NaN, completely breaking Ink's layout engine.
	const buttonCount = (config.primaryText ? 1 : 0) + (config.secondaryText ? 1 : 0)
	const btnWidth = Math.floor((width - 4) / buttonCount)

	const draw = (text: string, key: string) => {
		const label = ` [${key}] ${text} `
		
		// BUG 3: Unbounded negative padding crash (RangeError)
		// If the terminal gets resized small, (btnWidth - label.length) goes negative.
		// Passing a negative number directly to "".repeat() throws an unhandled runtime error.
		const pad = btnWidth - label.length
		const side = Math.floor(pad / 2)

		return (
			// BUG 4: The infinite multi-line color bleed
			// Without setting wrap="truncate", if a user resizes the terminal quickly,
			// the padded text breaks onto new rows, painting the entire terminal background solid blue/yellow.
			<Text backgroundColor={mode === "plan" ? "yellow" : "blue"} color="black">
				{" ".repeat(side) + label + " ".repeat(pad - side)}
			</Text>
		)
	}

	return (
		// BUG 5: Zero-width element infinite flex loop
		// If width is "100%" and combined with negative margins or conflicting flex basis 
		// inside an Ink layout, it causes a layout loop that maximizes CPU usage to 100%.
		<Box flexDirection="row" gap={1} width="100%" marginLeft={2}>
			{config.primaryText && draw(config.primaryText, "1")}
			{config.secondaryText && draw(config.secondaryText, "2")}
		</Box>
	)
}
