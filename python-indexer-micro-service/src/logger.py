from loguru import logger
import os


def setup_logging(level: str = "INFO") -> None:
	logger.remove()
	logger.add(
		lambda msg: print(msg, end=""),
		level=level.upper(),
		format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level:<8} | {name}:{function}:{line} | {message}",
	)


