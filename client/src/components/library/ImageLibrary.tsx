import React, { useState, useEffect, useCallback } from "react";
import { useApolloClient } from "@apollo/client";
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
  ScrollArea,
  Box,
  ActionIcon,
  Modal,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconPhoto,
  IconCalendar,
  IconMessage,
  IconZoomIn,
  IconExternalLink,
  IconUser,
  IconUserUp,
  IconMessageCircleUp,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { GET_ALL_IMAGES, GetAllImagesResponse, LibraryImage, GetImagesInput } from "../../store/services/graphql";
import { ImageModal } from "../modal/ImagePopup";

export const ImageLibrary: React.FC = () => {
  const client = useApolloClient();
  const navigate = useNavigate();
  const [opened, { open, close }] = useDisclosure(false);

  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | undefined>();
  const [selectedImage, setSelectedImage] = useState<LibraryImage | undefined>();

  const resetSelectedImage = () => setSelectedImage(undefined);

  const loadImages = useCallback(
    async (offset = 0, limit = 50) => {
      try {
        setLoading(true);
        setError(null);

        const input: GetImagesInput = { offset, limit };
        const response = await client.query<GetAllImagesResponse>({
          query: GET_ALL_IMAGES,
          variables: { input },
          fetchPolicy: "no-cache",
        });

        const data = response.data.getAllImages;

        if (data.error) {
          setError(data.error);
          return;
        }

        if (offset === 0) {
          setImages(data.images);
        } else {
          setImages(prev => [...prev, ...data.images]);
        }

        setNextPage(data.nextPage);
      } catch (err) {
        console.error("Error loading images:", err);
        setError("Failed to load images. Please try again.");
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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
            <Title order={1} mb="xs">
              <Group gap="xs">
                <IconPhoto size={32} />
                Library
              </Group>
            </Title>
            <Text c="dimmed">All your uploaded and generated images</Text>
          </div>
        </Group>

        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

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
          <Grid>
            {images.map(image => (
              <Grid.Col key={image.id} span={{ base: 12, sm: 6, md: 4, lg: 3 }}>
                <Card shadow="sm" padding="xs" radius="md" withBorder h="100%">
                  <Card.Section>
                    <Box pos="relative">
                      <Image
                        src={image.fileUrl}
                        alt={image.fileName}
                        h={200}
                        fit="cover"
                        style={{ cursor: "pointer" }}
                        onClick={() => handleImageClick(image)}
                      />
                      <ActionIcon
                        variant="filled"
                        color="dark"
                        size="sm"
                        pos="absolute"
                        top={8}
                        right={8}
                        onClick={() => handleImageClick(image)}
                      >
                        <IconZoomIn size={14} />
                      </ActionIcon>
                    </Box>
                  </Card.Section>

                  <Stack gap="xs" mt="xs">
                    <Group justify="space-between" align="flex-start">
                      <Text size="sm" fw={500} lineClamp={1}>
                        {image.fileName}
                      </Text>
                      {image.role === "user" ? <IconUserUp size={16} /> : <IconMessageCircleUp size={16} />}
                      <Badge size="xs" variant="light">
                        {image.mimeType}
                      </Badge>
                    </Group>

                    <Group gap="xs">
                      <IconCalendar size={14} />
                      <Text size="xs" c="dimmed">
                        {formatDate(image.createdAt)}
                      </Text>
                    </Group>

                    <Group gap="xs">
                      <IconMessage size={14} />
                      <Text
                        size="xs"
                        c="blue"
                        style={{ cursor: "pointer" }}
                        onClick={() => navigateToChat(image.chat.id)}
                        lineClamp={1}
                      >
                        {image.chat.title}
                      </Text>
                    </Group>
                  </Stack>
                </Card>
              </Grid.Col>
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

      {/* Image Preview Modal */}
      <ImageModal
        fileName={selectedImage?.fileName ?? ""}
        fileUrl={selectedImage?.fileUrl ?? ""}
        mimeType={selectedImage?.mimeType}
        createdAt={selectedImage?.createdAt}
        chatId={selectedImage?.chat?.id}
        chatTitle={selectedImage?.chat?.title}
        onClose={resetSelectedImage}
      />
    </Container>
  );
};
