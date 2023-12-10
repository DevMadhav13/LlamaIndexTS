import { BaseNode, Metadata, MetadataMode } from "../../Node";
import { VectorStore, VectorStoreQuery, VectorStoreQueryResult } from "./types";
import type { ChromaClient as ChromaClientT, Collection } from "chromadb";
import type { CollectionMetadata, Where } from "chromadb/dist/main/types.js";
import { Dictionary } from 'lodash'; 


class ChromaDBVectorStoredata {
  embeddingDict: Record<string, number[]> = {};
  textIdToRefDocId: Record<string, string> = {};
}

export class ChromaDBVectorStore implements VectorStore {
    
    storesText: boolean = true;
    isEmbeddingQuery?: boolean | undefined;
    index?: ChromaClientT;
    collection?: Collection;
    collectionMetadata: { metadata: any; };
    flat_metadata: any;
    _collection: any;
    
    
   

    async nodeToMetadataDict(

        DEFAULT_TEXT_KEY = "text",
        node: BaseNode,
        removeText: boolean = false,
        textField: string = DEFAULT_TEXT_KEY ,
        flatMetadata: boolean = false,
        ): Dictionary<any> {
        // Common logic for saving Node data into metadata dict
        const nodeDict: Dictionary<any> = node.dict();
        let metadata: Dictionary<any> = nodeDict["metadata"] || {};

        if (flatMetadata) {
            // _validateIsFlatDict(metadata);
            // Add logic to validate if metadata is flat
        }

        // Store entire node as JSON string - some minor text duplication
        if (removeText) {
            nodeDict[textField] = "";
        }

        // Remove embedding from nodeDict
        nodeDict["embedding"] = null;

        // Dump remainder of nodeDict to JSON string
        metadata["_node_content"] = JSON.stringify(nodeDict);
        metadata["_node_type"] = node.className();

        // Store ref doc id at top level to allow metadata filtering
        // Kept for backward compatibility, will consolidate in the future
        metadata["document_id"] = node.refDocId || "None"; // for Chroma
        metadata["doc_id"] = node.refDocId || "None"; // for Pinecone, Qdrant, Redis
        metadata["ref_doc_id"] = node.refDocId || "None"; // for Weaviate

        return metadata;
        }


    async ensureCollection(): Promise<Collection> {
        if (!this.collection) {
          try {
            this.collection = await this.index.getOrCreateCollection({
              name: this.collection,
              ...(this.collectionMetadata && { metadata: this.collectionMetadata }),
            });
          } catch (err) {
            throw new Error(`Chroma getOrCreateCollection error: ${err}`);
          }
        }
    
        return this.collection;
      }
      static async imports(): Promise<{
        ChromaClient: typeof ChromaClientT;
      }> {
        try {
          const { ChromaClient } = await import("chromadb");
          return { ChromaClient };
        } catch (e) {
          throw new Error(
            "Please install chromadb as a dependency with, e.g. `npm install -S chromadb`"
          );
        }
      }
    

    async client() {
        const collection = await this.ensureCollection();
        return this.collection;
     }
    async add(nodes: BaseNode<Metadata>[]): Promise<string[]> {
        const collection = await this.ensureCollection();

        if (!this.collection) {
            throw new Error("Collection not initialized");
        }

        const MAX_CHUNK_SIZE = 100; // Set your max chunk size
        const nodeChunks: BaseNode<Metadata>[][] = this.chunkList(nodes, MAX_CHUNK_SIZE);

        const allIds: string[] = [];
        for (const nodeChunk of nodeChunks) {
            const embeddings: number[][] = [];
            const metadatas: any[] = [];
            const ids: string[] = [];
            const documents: any[] = [];
            for (const node of nodeChunk) {
                embeddings.push(node.getEmbedding());
                const metadata_dict: any = node_to_metadata_dict(
                    node,
                    { remove_text: true, flat_metadata: this.flat_metadata }
                );
                
                if ("context" in metadata_dict && metadata_dict["context"] === null) {
                    metadata_dict["context"] = "";
                }
                
                metadatas.push(metadata_dict);
                metadatas.push(metadata_dict);
                ids.push(node.nodeId);
                documents.push(node.getContent(MetadataMode.NONE));
            }

            await this._collection.add({
                embeddings: embeddings,
                ids: ids,
                metadatas: metadatas,
                documents: documents,
            });
            allIds.push(...ids);
        }

        return allIds;
    }
    
    private chunkList<T>(list: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < list.length; i += chunkSize) {
            chunks.push(list.slice(i, i + chunkSize));
        }
        return chunks;
    }
    
    async delete(refDocId: string, deleteOptions?: any): Promise<void> {
        const collection = await this.ensureCollection();
    
        if (deleteOptions?.ids || deleteOptions?.where || deleteOptions?.where_document) {
            const { ids, where, where_document } = deleteOptions;
            await collection.delete({ ids, where, where_document });
        } else {
            throw new Error(`You must provide either "ids", "where", or "where_document".`);
        }
    }
    
    query(query: VectorStoreQuery, options?: any): Promise<VectorStoreQueryResult> {
        throw new Error("Method not implemented.");
    }
    
  
}


