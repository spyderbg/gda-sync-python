"""Typed shapes of the resource descriptors used by the selected game."""

from __future__ import annotations

from dataclasses import dataclass, field, fields, is_dataclass
from types import UnionType
from typing import Any, TypeVar, Union, get_args, get_origin, get_type_hints


@dataclass(frozen=True, slots=True)
class Rectangle:
    x: int
    y: int
    w: int
    h: int


@dataclass(frozen=True, slots=True)
class IData:
    id: str
    dataType: str
    path: str
    resolution: str | None = None
    integration: str | None = None


@dataclass(frozen=True, slots=True)
class Element:
    id: str
    path: str
    resolution: str | None = None
    integration: str | None = None


@dataclass(frozen=True, slots=True)
class Font:
    id: str
    path: str
    chars: str
    size: int
    resolution: str | None = None


@dataclass(frozen=True, slots=True)
class TextStyle:
    id: str
    font_id: str
    size: int
    resolution: str | None = None


@dataclass(frozen=True, slots=True)
class Image:
    id: str
    path: str
    source: Rectangle | None = None
    resolution: str | None = None
    language: str | None = None
    integration: str | None = None


@dataclass(frozen=True, slots=True)
class Frame:
    path: str
    source: Rectangle | None = None


@dataclass(frozen=True, slots=True)
class ImageSequence:
    id: str
    frameTime: int
    loopCount: int
    frames: list[Frame]
    loopTo: int | None = None
    resolution: str | None = None
    language: str | None = None


@dataclass(frozen=True, slots=True)
class Movie:
    id: str
    path: str
    movieFormat: str


@dataclass(frozen=True, slots=True)
class RawFile:
    path: str


@dataclass(frozen=True, slots=True)
class Rtf:
    id: str
    path: str
    integration: str | None = None


@dataclass(frozen=True, slots=True)
class AudioEvent:
    id: str
    samples: list[str]
    polyphonyGroup: str | None = None
    loop: bool | None = None
    fadeIn: float | None = None
    fadeOut: float | None = None


@dataclass(frozen=True, slots=True)
class Localization:
    id: str
    path: str
    integration: str | None = None


@dataclass(frozen=True, slots=True)
class AllRssData:
    """Either a list of includes or, as in the launcher, the resources themselves."""

    include: list[str] = field(default_factory=list)
    fonts: list[Font] = field(default_factory=list)
    images: list[Image] = field(default_factory=list)
    rawFiles: list[RawFile] = field(default_factory=list)
    styles: list[TextStyle] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class RssAudioData:
    idatas: list[IData] = field(default_factory=list)
    audioEvents: list[AudioEvent] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class RssElementsListData:
    elements: list[Element]


@dataclass(frozen=True, slots=True)
class RssFontsData:
    fonts: list[Font]


@dataclass(frozen=True, slots=True)
class RssIData:
    idatas: list[IData]


@dataclass(frozen=True, slots=True)
class RssImagesData:
    images: list[Image]


@dataclass(frozen=True, slots=True)
class RssImagesSeqData:
    imagesSeq: list[ImageSequence]


@dataclass(frozen=True, slots=True)
class RssLocalizationData:
    localizations: list[Localization]


@dataclass(frozen=True, slots=True)
class RssMoviesData:
    movies: list[Movie]


@dataclass(frozen=True, slots=True)
class RssRawData:
    rawFiles: list[RawFile]


@dataclass(frozen=True, slots=True)
class RssRtfsData:
    rtfs: list[Rtf]


@dataclass(frozen=True, slots=True)
class RssTextStylesData:
    styles: list[TextStyle]


@dataclass(frozen=True, slots=True)
class RssData:
    """Shared descriptors included by AllRssData.json."""

    include: list[str] = field(default_factory=list)
    idatas: list[IData] = field(default_factory=list)
    elements: list[Element] = field(default_factory=list)
    fonts: list[Font] = field(default_factory=list)
    styles: list[TextStyle] = field(default_factory=list)
    images: list[Image] = field(default_factory=list)
    imagesSeq: list[ImageSequence] = field(default_factory=list)
    movies: list[Movie] = field(default_factory=list)
    rtfs: list[Rtf] = field(default_factory=list)
    audioEvents: list[AudioEvent] = field(default_factory=list)
    localizations: list[Localization] = field(default_factory=list)
    rawFiles: list[RawFile] = field(default_factory=list)


DOCUMENT_TYPES: dict[str, type] = {
    "AllRssData.json": AllRssData,
    "RssAudioData.json": RssAudioData,
    "RssElementsListData.json": RssElementsListData,
    "RssFontsData.json": RssFontsData,
    "RssIData.json": RssIData,
    "RssImagesData.json": RssImagesData,
    "RssImagesSeqData.json": RssImagesSeqData,
    "RssLocalizationData.json": RssLocalizationData,
    "RssMoviesData.json": RssMoviesData,
    "RssRawData.json": RssRawData,
    "RssRtfsData.json": RssRtfsData,
    "RssTextStylesData.json": RssTextStylesData,
    "RssData.json": RssData,
}

T = TypeVar("T")


def parse_dataclass(cls: type[T], value: Any, location: str) -> T:
    """Reject malformed or unknown fields instead of silently losing resources."""
    if not isinstance(value, dict):
        raise ValueError(f"{location}: expected an object")
    known = {item.name for item in fields(cls)}
    extra = value.keys() - known
    if extra:
        raise ValueError(f"{location}: unknown fields: {', '.join(sorted(extra))}")
    hints = get_type_hints(cls)
    parsed = {
        key: _parse_value(hints[key], item, f"{location}.{key}")
        for key, item in value.items()
    }
    try:
        return cls(**parsed)
    except TypeError as exc:
        raise ValueError(f"{location}: {exc}") from exc


def _parse_value(expected: Any, value: Any, location: str) -> Any:
    origin = get_origin(expected)
    if origin in (UnionType, Union):
        if value is None and type(None) in get_args(expected):
            return None
        options = [arg for arg in get_args(expected) if arg is not type(None)]
        if len(options) == 1:
            return _parse_value(options[0], value, location)
    if origin is list:
        if not isinstance(value, list):
            raise ValueError(f"{location}: expected a list")
        return [_parse_value(get_args(expected)[0], item, f"{location}[{index}]")
                for index, item in enumerate(value)]
    if is_dataclass(expected):
        return parse_dataclass(expected, value, location)
    if type(value) is not expected:
        raise ValueError(f"{location}: expected {expected.__name__}")
    return value
