import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { Chat } from '../entities/Chat';
import { Message } from '../entities/Message';
import { Model } from '../entities/Model';
import { ModelProvider } from '../entities/ModelProvider';
import path from 'path';

// Initialize MongoDB connection
export const AppDataSource = new DataSource({
  type: 'mongodb',
  url: process.env.MONGODB_URI || 'mongodb://localhost:27017/kate-chat',
  synchronize: true,
  logging: process.env.NODE_ENV === 'development',
  entities: [User, Chat, Message, Model, ModelProvider],
  subscribers: [],
  useUnifiedTopology: true,
  useNewUrlParser: true,
});

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Error during database initialization', error);
    throw error;
  }
};