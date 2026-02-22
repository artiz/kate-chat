import React from "react";
import { ColorSwatch, Group, Tooltip } from "@mantine/core";
import { useMantineTheme } from "@mantine/core";

const FOLDER_COLORS = [
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
];

interface IProps {
  value?: string;
  onChange: (color: string | undefined) => void;
}

export const FolderColorPicker: React.FC<IProps> = ({ value, onChange }) => {
  const theme = useMantineTheme();

  return (
    <Group gap={6} wrap="wrap">
      {FOLDER_COLORS.map(color => (
        <Tooltip key={color} label={color} withArrow>
          <ColorSwatch
            color={theme.colors[color][6]}
            size={22}
            style={{
              cursor: "pointer",
              outline: value === color ? `2px solid ${theme.colors[color][8]}` : undefined,
              outlineOffset: 2,
            }}
            onClick={() => onChange(value === color ? undefined : color)}
          />
        </Tooltip>
      ))}
    </Group>
  );
};
