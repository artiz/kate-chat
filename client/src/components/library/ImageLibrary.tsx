import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useApolloClient, useMutation } from "@apollo/client";
import {
  Container,
  Title,
  Grid,
  Card,
  Image,
  Text,
  Badge,
  Center,
  Loader,
  Alert,
  Group,
  Button,
  Stack,
  Box,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconPhoto,
  IconCalendar,
  IconMessage,
  IconZoomIn,
  IconUserUp,
  IconMessageCircleUp,
  IconRefresh,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { ImagePopup } from "@katechat/ui";
import { GET_ALL_IMAGES, RELOAD_CHAT_FILE_METADATA } from "../../store/services/graphql.queries";
import { GetAllImagesResponse, GetImagesInput, LibraryImage } from "@/types/graphql";
import { notifications } from "@mantine/notifications";
import { Link } from "react-router-dom";

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const ImageCard: React.FC<{
  image: LibraryImage;
  reloading: boolean;
  onReloadInfo: (e: React.MouseEvent, imageId: string) => void;
  onOpenSource?: () => void;
  onClick: () => void;
}> = ({ image, onClick, onReloadInfo, reloading, onOpenSource }) => {
  const handleReloadInfo = useCallback(
    (e: React.MouseEvent) => {
      onReloadInfo(e, image.id);
    },
    [image.id, onReloadInfo]
  );

  const borderColor = useMemo(
    () => (image.predominantColor ? image.predominantColor : "var(--paper-border-color)"),
    [image.predominantColor]
  );
  const backgroundColor = useMemo(
    () => (image.predominantColor ? image.predominantColor : "var(--mantine-color-body)"),
    [image.predominantColor]
  );

  const textColor = useMemo(() => {
    if (!image.predominantColor) return undefined;
    const r = parseInt(image.predominantColor.slice(1, 3), 16);
    const g = parseInt(image.predominantColor.slice(3, 5), 16);
    const b = parseInt(image.predominantColor.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "#333" : "#ccc";
  }, [image.predominantColor]);

  const cardStyle = {
    height: "100%",
    backgroundColor,
    color: textColor,
    borderColor,
    borderWidth: 8,
    borderStyle: "solid",
  };

  return (
    <Grid.Col key={image.id} span={{ base: 12, sm: 6, md: 4, lg: 3 }}>
      <Card shadow="0" padding="xs" radius="0" style={cardStyle}>
        <Card.Section>
          <Box pos="relative">
            <Image
              src={image.fileUrl}
              alt={image.fileName}
              h={200}
              fit="cover"
              style={{ cursor: "pointer" }}
              onClick={onClick}
            />
            <Group gap={4} pos="absolute" top={8} right={8}>
              <Tooltip label="Reload Info (Color & EXIF)">
                <ActionIcon variant="filled" color="dark" size="sm" loading={reloading} onClick={handleReloadInfo}>
                  <IconRefresh size={14} />
                </ActionIcon>
              </Tooltip>
              <ActionIcon variant="filled" color="dark" size="sm" onClick={onClick}>
                <IconZoomIn size={14} />
              </ActionIcon>
            </Group>
          </Box>
        </Card.Section>

        <Stack gap="xs" mt="xs">
          <Group justify="space-between" align="flex-start">
            {image.role === "user" ? (
              <IconUserUp size={16} color={textColor} />
            ) : (
              <IconMessageCircleUp size={16} color={textColor} />
            )}
            <Badge size="xs" variant="light" c={textColor}>
              {image.mime}
            </Badge>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <IconCalendar size={14} color={textColor} />
            <Text size="xs" c={textColor || "dimmed"}>
              {formatDate(image.createdAt)}
            </Text>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <IconMessage size={14} color={textColor} />
            <Text
              size="xs"
              c={textColor || "blue"}
              style={{ cursor: "pointer", textDecoration: "underline", color: textColor || undefined }}
              onClick={onOpenSource}
              lineClamp={1}
            >
              {image.chat.title || image.chat.id}
            </Text>
          </Group>
        </Stack>
      </Card>
    </Grid.Col>
  );
};

export const ImageLibrary: React.FC = () => {
  const client = useApolloClient();
  const navigate = useNavigate();
  const [opened, { open, close }] = useDisclosure(false);
  const [reloadMetadata] = useMutation(RELOAD_CHAT_FILE_METADATA);

  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPage, setNextPage] = useState<number | undefined>();
  const [selectedImage, setSelectedImage] = useState<LibraryImage | undefined>();
  const [reloadingIds, setReloadingIds] = useState<Set<string>>(new Set());

  const resetSelectedImage = () => setSelectedImage(undefined);

  const handleReloadInfo = async (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    if (reloadingIds.has(imageId)) return;

    setReloadingIds(prev => new Set(prev).add(imageId));
    try {
      const { data } = await reloadMetadata({ variables: { id: imageId } });
      if (data?.reloadChatFileMetadata) {
        setImages(prev => prev.map(img => (img.id === imageId ? { ...img, ...data.reloadChatFileMetadata } : img)));
      }
    } catch (err) {
      notifications.show({
        title: "Error",
        message: `Failed to reload image info: ${err instanceof Error ? err.message : String(err)}`,
        color: "red",
      });
    } finally {
      setReloadingIds(prev => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  };

  const loadImages = useCallback(
    async (offset = 0, limit = 50) => {
      try {
        setLoading(true);

        const input: GetImagesInput = { offset, limit };
        const response = await client.query<GetAllImagesResponse>({
          query: GET_ALL_IMAGES,
          variables: { input },
          fetchPolicy: "no-cache",
        });

        const data = response.data.getAllImages;

        if (data.error) {
          notifications.show({
            title: "Error",
            message: data.error,
            color: "red",
          });
          return;
        }

        if (offset === 0) {
          setImages(data.images);
        } else {
          setImages(prev => [...prev, ...data.images]);
        }

        setNextPage(data.nextPage);
      } catch (err) {
        notifications.show({
          title: "Error",
          message: `Failed to reload: ${err instanceof Error ? err.message : String(err)}`,
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  const loadMore = useCallback(() => {
    if (!loading && nextPage) {
      loadImages(nextPage);
    }
  }, [loading, nextPage, loadImages]);

  const handleImageClick = (image: LibraryImage) => {
    setSelectedImage(image);
    open();
  };

  const navigateToChat = (chatId: string) => {
    navigate(`/chat/${chatId}`);
    close();
  };

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  if (loading && images.length === 0) {
    return (
      <Container size="lg" py="xl">
        <Center h="50vh">
          <Stack align="center">
            <Loader size="xl" />
            <Text>Loading your image library...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2} mb="lg">
              <Group gap="xs">
                <IconPhoto size={32} />
                Library
              </Group>
            </Title>
            <Text c="dimmed">All your uploaded and generated images</Text>
          </div>
        </Group>

        {images.length === 0 && !loading ? (
          <Center h="50vh">
            <Stack align="center" gap="md">
              <IconPhoto size={64} color="var(--mantine-color-gray-5)" />
              <Text size="lg" c="dimmed">
                No images found
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Upload images in your chats to see them here
              </Text>
            </Stack>
          </Center>
        ) : (
          <Grid gutter="xs">
            {images.map(image => (
              <ImageCard
                key={image.id}
                image={image}
                onClick={() => handleImageClick(image)}
                onReloadInfo={handleReloadInfo}
                reloading={reloadingIds.has(image.id)}
                onOpenSource={image.chat?.id ? () => navigateToChat(image.chat.id) : undefined}
              />
            ))}
          </Grid>
        )}

        {nextPage && images.length > 0 && (
          <Center mt="lg">
            <Button variant="outline" loading={loading} onClick={loadMore}>
              Load More Images
            </Button>
          </Center>
        )}
      </Stack>

      <ImagePopup
        fileName={selectedImage?.fileName ?? ""}
        fileUrl={selectedImage?.fileUrl ?? ""}
        mimeType={selectedImage?.mime}
        createdAt={selectedImage?.createdAt}
        onOpenSource={selectedImage?.chat?.id ? () => navigateToChat(selectedImage.chat.id) : undefined}
        sourceTitle={selectedImage?.chat?.title}
        onClose={resetSelectedImage}
      />
    </Container>
  );
};
